import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { and, desc, eq, gte, lte, sql, type AnyColumn } from "drizzle-orm";
import { decodeJwt } from "jose";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  analyticsAudit,
  analyticsClarityConnections as connections,
  analyticsClarityPages as pages,
  analyticsSources,
} from "@/db/schema";
import {
  ClarityError,
  clarityPageInsights,
  type ClarityMeasures,
} from "@/server/lib/clarityClient";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { AnalyticsQuery } from "@/types/schemas/analytics";
import { safeAnalyticsPath } from "./AnalyticsCollection";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
import { configurationAuditRows } from "./AnalyticsReportingConfiguration";
import { deriveProjectSecret } from "./crypto";

// Microsoft Clarity for a project: the connection (its Clarity project and an
// encrypted Data Export token), the daily snapshot of what Clarity measured on
// each page, and the read that the exits report joins to its pages.
//
// Sessions and bot sessions are counts. Every other measure is an average
// over sessions, so URLs and days are combined as session-weighted means.

const AVERAGES = [
  "scrollDepth",
  "activeTime",
  "deadClickPct",
  "rageClickPct",
  "quickBackPct",
  "excessiveScrollPct",
  "errorClickPct",
  "scriptErrorPct",
] as const;
type Average = (typeof AVERAGES)[number];
/** The busiest pages are what a report reads. */
const PAGES_PER_DAY = 200;
// Fourteen values a row; D1 allows 100 bound parameters a statement.
const ROWS_PER_INSERT = 6;

async function tokenKey(projectId: string) {
  const root = await getOptionalEnvValue("ANALYTICS_SERVER_EVENT_SECRET");
  if (!root)
    throw new AppError(
      "VALIDATION_ERROR",
      "Configure ANALYTICS_SERVER_EVENT_SECRET before connecting Clarity.",
    );
  return deriveProjectSecret(root, projectId, "provider");
}

/** The Clarity project a Data Export token was created in (its subject is the project ID as a number), or null when the token does not say. */
function clarityProjectOfToken(token: string) {
  try {
    const subject = decodeJwt(token).sub;
    return subject && /^\d{1,20}$/.test(subject)
      ? BigInt(subject).toString(36)
      : null;
  } catch {
    return null;
  }
}

/** The connection as a reader may see it: never the token. */
export async function clarityConnection(projectId: string) {
  const [row] = await db
    .select({
      clarityProjectId: connections.clarityProjectId,
      lastSyncedAt: connections.lastSyncedAt,
      lastSyncError: connections.lastSyncError,
      updatedAt: connections.updatedAt,
    })
    .from(connections)
    .where(eq(connections.projectId, projectId))
    .limit(1);
  return row ?? null;
}

export async function saveClarityConnection(
  input: { projectId: string; clarityProjectId: string; token: string },
  actorId: string,
) {
  const previous = await clarityConnection(input.projectId);
  const row = {
    projectId: input.projectId,
    clarityProjectId: input.clarityProjectId,
    encryptedToken: await symmetricEncrypt({
      key: await tokenKey(input.projectId),
      data: input.token,
    }),
    connectedByUserId: actorId,
    lastSyncedAt: null,
    lastSyncError: null,
    updatedAt: new Date().toISOString(),
  };
  // The audit trail records that the token changed, never its value.
  const audit = configurationAuditRows(
    input.projectId,
    actorId,
    "clarity-connection",
    {
      clarityProjectId: previous?.clarityProjectId,
      token: previous ? "set" : null,
    },
    { clarityProjectId: input.clarityProjectId, token: "replaced" },
  );
  await runBatch((tx) => [
    tx
      .insert(connections)
      .values(row)
      .onConflictDoUpdate({ target: connections.projectId, set: row }),
    tx.insert(analyticsAudit).values(audit),
  ]);
  const tokenProject = clarityProjectOfToken(input.token);
  return {
    connection: await clarityConnection(input.projectId),
    // A token from another Clarity project reads that project's pages, which
    // are usually none. Said, not refused: the token does not promise this.
    warning:
      tokenProject && tokenProject !== input.clarityProjectId
        ? `This token looks like it was created in Clarity project ${tokenProject}, not ${input.clarityProjectId}. If the snapshot stays empty, create the token in ${input.clarityProjectId} under Settings, Data Export.`
        : null,
  };
}

/** Forgets the token. The page measures already kept stay with the project. */
export async function removeClarityConnection(
  projectId: string,
  actorId: string,
) {
  const previous = await clarityConnection(projectId);
  if (!previous) return;
  await runBatch((tx) => [
    tx.delete(connections).where(eq(connections.projectId, projectId)),
    tx
      .insert(analyticsAudit)
      .values(
        configurationAuditRows(
          projectId,
          actorId,
          "clarity-connection",
          { clarityProjectId: previous.clarityProjectId, token: "set" },
          { clarityProjectId: null, token: null },
        ),
      ),
  ]);
}

/** A page's URLs added up. An average is weighted by the sessions of the URLs that have it. */
type PageTotals = {
  sessions: number;
  botSessions: number | null;
  averages: Partial<
    Record<
      Average,
      { weighted: number; weight: number; plain: number; count: number }
    >
  >;
};
function addUrl(
  totals: PageTotals = { sessions: 0, botSessions: null, averages: {} },
  measures: ClarityMeasures,
) {
  const sessions = measures.sessions ?? 0;
  totals.sessions += sessions;
  if (measures.botSessions !== undefined)
    totals.botSessions = (totals.botSessions ?? 0) + measures.botSessions;
  for (const measure of AVERAGES) {
    const value = measures[measure];
    if (value === undefined) continue;
    const sum = (totals.averages[measure] ??= {
      weighted: 0,
      weight: 0,
      plain: 0,
      count: 0,
    });
    sum.weighted += value * sessions;
    sum.weight += sessions;
    sum.plain += value;
    sum.count++;
  }
  return totals;
}
function averageOf(totals: PageTotals, measure: Average) {
  const sum = totals.averages[measure];
  if (!sum) return null;
  return sum.weight ? sum.weighted / sum.weight : sum.plain / sum.count;
}

const siteHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

async function syncProject(
  connection: typeof connections.$inferSelect,
  now: Date,
  fetchImpl?: typeof fetch,
) {
  const token = await symmetricDecrypt({
    key: await tokenKey(connection.projectId),
    data: connection.encryptedToken,
  });
  const insights = await clarityPageInsights(token, fetchImpl);
  if (!insights.length)
    throw new ClarityError(
      `Clarity returned no pages for the last 24 hours. Check the token was created in Clarity project ${connection.clarityProjectId}.`,
    );
  // Only pages on the live sites this project tracks, by the path journeys use.
  const sources = await db
    .select({ hostname: analyticsSources.hostname })
    .from(analyticsSources)
    .where(
      and(
        eq(analyticsSources.projectId, connection.projectId),
        eq(analyticsSources.environment, "production"),
        eq(analyticsSources.enabled, true),
      ),
    );
  const hosts = new Set(sources.map((s) => siteHost(s.hostname)));
  const byPath = new Map<string, PageTotals>();
  for (const page of insights) {
    let url: URL;
    try {
      url = new URL(page.url);
    } catch {
      continue;
    }
    if (!hosts.has(siteHost(url.hostname))) continue;
    const path = safeAnalyticsPath(url.pathname);
    byPath.set(path, addUrl(byPath.get(path), page.measures));
  }
  // Nothing to keep is a fault to show, not a day to overwrite with nothing.
  if (!byPath.size)
    throw new ClarityError(
      "Clarity returned pages, but none on this project's live source hostnames. Check the hostnames under Install.",
    );
  // The request covers the 24 hours to now; it is filed under the day most
  // of those hours fall on.
  const day = new Date(now.getTime() - 12 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const rows = [...byPath]
    .toSorted((a, b) => b[1].sessions - a[1].sessions)
    .slice(0, PAGES_PER_DAY)
    .map(([pagePath, totals]) => ({
      id: crypto.randomUUID(),
      projectId: connection.projectId,
      day,
      pagePath,
      sessions: Math.round(totals.sessions),
      botSessions:
        totals.botSessions === null ? null : Math.round(totals.botSessions),
      scrollDepth: averageOf(totals, "scrollDepth"),
      activeTime: averageOf(totals, "activeTime"),
      deadClickPct: averageOf(totals, "deadClickPct"),
      rageClickPct: averageOf(totals, "rageClickPct"),
      quickBackPct: averageOf(totals, "quickBackPct"),
      excessiveScrollPct: averageOf(totals, "excessiveScrollPct"),
      errorClickPct: averageOf(totals, "errorClickPct"),
      scriptErrorPct: averageOf(totals, "scriptErrorPct"),
    }));
  const inserts: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT)
    inserts.push(rows.slice(i, i + ROWS_PER_INSERT));
  // A day is replaced whole, so running twice leaves one copy.
  await runBatch((tx) => [
    tx
      .delete(pages)
      .where(
        and(eq(pages.projectId, connection.projectId), eq(pages.day, day)),
      ),
    ...inserts.map((chunk) => tx.insert(pages).values(chunk)),
    tx
      .update(connections)
      .set({ lastSyncedAt: now.toISOString(), lastSyncError: null })
      .where(eq(connections.projectId, connection.projectId)),
  ]);
}

/** The last day's pages from Clarity, for every connected project. One project's failure is recorded on its connection and does not stop the rest. */
export async function syncClarityPages(
  now = new Date(),
  fetchImpl?: typeof fetch,
) {
  for (const connection of await db.select().from(connections)) {
    try {
      await syncProject(connection, now, fetchImpl);
    } catch (error) {
      // Only the Clarity client's own wording is kept: another error's text
      // may quote the request, and so the token.
      const lastSyncError =
        error instanceof ClarityError
          ? error.message
          : "Clarity could not be read.";
      await db
        .update(connections)
        .set({ lastSyncError })
        .where(eq(connections.projectId, connection.projectId))
        .catch(() => {
          console.error("[clarity] could not record a failed snapshot");
        });
    }
  }
}

/** A page's average over the period, each day weighted by its sessions. */
const average = (column: AnyColumn) =>
  sql<
    number | null
  >`sum(${column} * ${pages.sessions}) / nullif(sum(case when ${column} is not null then ${pages.sessions} end), 0)`.mapWith(
    (value: unknown) => (value === null ? null : Number(value)),
  );

type PageMeasures = { sessions: number; botSessions: number | null } & Record<
  Average,
  number | null
>;

/** What Clarity measured on each page over the period, and how many days of it there are. Clarity is on the live site, so a test report has none. */
export async function clarityPages(q: AnalyticsQuery) {
  if (q.environment !== "production")
    return { days: 0, pages: new Map<string, PageMeasures>() };
  const window = repo.windowFor(q);
  const inPeriod = and(
    eq(pages.projectId, q.projectId),
    gte(pages.day, window.from.slice(0, 10)),
    lte(pages.day, window.to.slice(0, 10)),
  );
  const sessions = sql<number>`sum(${pages.sessions})`;
  const [rows, [coverage]] = await Promise.all([
    db
      .select({
        pagePath: pages.pagePath,
        sessions: sessions.mapWith(Number),
        botSessions: sql<number | null>`sum(${pages.botSessions})`.mapWith(
          (value: unknown) => (value === null ? null : Number(value)),
        ),
        scrollDepth: average(pages.scrollDepth),
        activeTime: average(pages.activeTime),
        deadClickPct: average(pages.deadClickPct),
        rageClickPct: average(pages.rageClickPct),
        quickBackPct: average(pages.quickBackPct),
        excessiveScrollPct: average(pages.excessiveScrollPct),
        errorClickPct: average(pages.errorClickPct),
        scriptErrorPct: average(pages.scriptErrorPct),
      })
      .from(pages)
      .where(inPeriod)
      .groupBy(pages.pagePath)
      .orderBy(desc(sessions))
      .limit(5000),
    db
      .select({
        days: sql<number>`count(distinct ${pages.day})`.mapWith(Number),
      })
      .from(pages)
      .where(inPeriod),
  ]);
  return {
    days: coverage?.days ?? 0,
    pages: new Map<string, PageMeasures>(
      rows.map(({ pagePath, ...measures }) => [pagePath, measures]),
    ),
  };
}
