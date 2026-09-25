import { collectionPolicy, pathIsExcluded } from "./AnalyticsCollectionPolicy";
import { and, eq, gte, count, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  analyticsActions,
  analyticsContexts,
  analyticsEvents,
  analyticsNetworkObservations,
  analyticsEntries,
  analyticsTombstones,
} from "@/db/schema";
import type { JourneyEvent } from "@/types/schemas/analytics";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
import { currentAndPreviousNetworkKeys } from "./crypto";
import { adoptAnonymousContext, keyedEvent } from "./AnalyticsAnonymous";
import { bindIdentity, candidateFor } from "./AnalyticsAttribution";
export type AnalyticsSecrets = {
  networkSecret?: string;
  identitySecret?: string;
  serverSecret?: string;
};
export function safeAnalyticsPath(path: string) {
  return path
    .split(/[?#]/)[0]
    .split("/")
    .map((segment) => {
      let s: string;
      try {
        s = decodeURIComponent(segment);
      } catch {
        return ":redacted";
      }
      return /@|\d{4,}|[a-f0-9]{16,}|[\w-]{32,}/i.test(s)
        ? ":redacted"
        : segment;
    })
    .join("/")
    .slice(0, 500);
}
const safeCampaign = (value: string | undefined) =>
  value && !/@|bearer|token=/i.test(value) ? value : null;
export async function collectionSource(
  event: JourneyEvent,
  origin: string | null,
) {
  const source = await repo.source(event.sourceId);
  if (
    !source ||
    !source.enabled ||
    source.publicKey !== event.projectKey ||
    source.environment !== event.environment
  )
    throw new Error("Unknown source");
  if (!origin || new URL(origin).hostname !== source.hostname)
    throw new Error("Disallowed origin");
  if (event.page && event.page.host !== source.hostname)
    throw new Error("Page host does not match source");
  return source;
}
export async function collect(input: {
  events: JourneyEvent[];
  origin: string | null;
  observedIp: string | null;
  userAgent?: string | null;
  secrets: AnalyticsSecrets;
  now?: Date;
}) {
  let accepted = 0;
  let duplicates = 0;
  for (const [sequence, raw] of input.events.entries()) {
    const now = input.now ?? new Date();
    const receivedAt = now.toISOString();
    const source = await collectionSource(raw, input.origin);
    const policy = await collectionPolicy(source.projectId);
    if (
      raw.name !== "consent_withdrawn" &&
      raw.page &&
      pathIsExcluded(raw.page.path, policy.prefixes)
    )
      continue;
    const visitor = {
      source,
      observedIp: input.observedIp,
      userAgent: input.userAgent,
      networkSecret: input.secrets.networkSecret,
      now,
    };
    const event = await keyedEvent(raw, visitor);
    if (!event) continue;
    const contextKey = event.contextId;
    let context: typeof analyticsContexts.$inferSelect | undefined =
      await repo.context(source.projectId, source.id, contextKey);
    if (event.name === "consent_withdrawn") {
      if (context) await eraseContext(source.projectId, context.id);
      accepted++;
      continue;
    }
    if (!event.consent.analytics) continue;
    const [tombstone] = await db
      .select()
      .from(analyticsTombstones)
      .where(
        and(
          eq(analyticsTombstones.projectId, source.projectId),
          eq(analyticsTombstones.sourceId, source.id),
          eq(analyticsTombstones.contextKey, contextKey),
        ),
      )
      .limit(1);
    if (tombstone) continue;
    const [existing] = await db
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.projectId, source.projectId),
          eq(analyticsEvents.eventId, event.eventId),
        ),
      )
      .limit(1);
    if (existing) {
      duplicates++;
      continue;
    }
    const [volume] = await db
      .select({ total: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.sourceId, source.id),
          gte(analyticsEvents.receivedAt, receivedAt.slice(0, 10)),
        ),
      );
    if ((volume?.total ?? 0) >= 100000)
      throw new Error("Daily source event limit reached");
    if (event.name === "identity_known" && !event.identityAssertion)
      throw new Error("Verified identity assertion required");
    if (event.name === "product_opened" && source.kind !== "product")
      throw new Error("Product source required");
    if (event.name === "acquisition_clicked") {
      const [action] = await db
        .select()
        .from(analyticsActions)
        .where(
          and(
            eq(analyticsActions.projectId, source.projectId),
            eq(analyticsActions.action, event.properties?.action ?? ""),
            eq(
              analyticsActions.destination,
              event.properties?.destination ?? "",
            ),
          ),
        )
        .limit(1);
      if (!action) throw new Error("Acquisition action is not configured");
    }
    if (!context)
      context = await adoptAnonymousContext(
        contextKey,
        event.consent.policyVersion,
        visitor,
      );
    if (!context) {
      await db
        .insert(analyticsContexts)
        .values({
          id: crypto.randomUUID(),
          projectId: source.projectId,
          sourceId: source.id,
          contextKey,
          environment: source.environment,
          createdAt: receivedAt,
          lastSeenAt: receivedAt,
          sessionId: crypto.randomUUID(),
          attributionAllowed: event.consent.attribution,
          identityAllowed: event.consent.identity,
          policyVersion: event.consent.policyVersion,
        })
        .onConflictDoNothing();
      context = await repo.context(source.projectId, source.id, contextKey);
    }
    if (!context) throw new Error("Context unavailable");
    const sessionId =
      Date.parse(receivedAt) - Date.parse(context.lastSeenAt) >= 1800_000
        ? crypto.randomUUID()
        : context.sessionId;
    await bindIdentity(event, source, context, input.secrets);
    const row = eventRow({
      event,
      source,
      context,
      sessionId,
      receivedAt,
      sequence,
    });
    if (
      row.referrerHost &&
      policy.internalHosts.has(row.referrerHost.replace(/^www\./, ""))
    )
      row.referrerHost = null;
    let networkKeys: Awaited<ReturnType<typeof currentAndPreviousNetworkKeys>> =
      [];
    if (
      event.consent.attribution &&
      input.observedIp &&
      input.secrets.networkSecret &&
      ["acquisition_clicked", "product_opened"].includes(event.name)
    )
      networkKeys = await currentAndPreviousNetworkKeys(
        input.secrets.networkSecret,
        source.projectId,
        input.observedIp,
        now,
      );
    await runBatch((tx) => [
      tx
        .update(analyticsContexts)
        .set({
          lastSeenAt: receivedAt,
          sessionId,
          attributionAllowed: event.consent.attribution,
          identityAllowed: event.consent.identity,
        })
        .where(eq(analyticsContexts.id, context.id)),
      tx.insert(analyticsEvents).values(row).onConflictDoNothing(),
      ...networkKeys.map((k) =>
        tx
          .insert(analyticsNetworkObservations)
          .select(
            tx
              .select({
                id: sql<string>`${crypto.randomUUID()}`.as("id"),
                projectId: analyticsEvents.projectId,
                environment: analyticsEvents.environment,
                eventId: analyticsEvents.id,
                epoch: sql<string>`${k.epoch}`.as("epoch"),
                networkKey: sql<string>`${k.key}`.as("network_key"),
                family:
                  sql<string>`${input.observedIp?.includes(":") ? "ipv6" : "ipv4"}`.as(
                    "family",
                  ),
                observedAt: analyticsEvents.receivedAt,
                expiresAt:
                  sql<string>`${new Date(now.getTime() + 48 * 3600_000).toISOString()}`.as(
                    "expires_at",
                  ),
              })
              .from(analyticsEvents)
              .where(eq(analyticsEvents.id, row.id)),
          )
          .onConflictDoNothing(),
      ),
    ]);
    const [persisted] = await db
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.id, row.id))
      .limit(1);
    if (!persisted) {
      duplicates++;
      continue;
    }
    if (event.name === "product_opened") {
      const match = await candidateFor(context, row);
      await db
        .insert(analyticsEntries)
        .values({
          id: crypto.randomUUID(),
          projectId: source.projectId,
          contextId: context.id,
          entryEventId: row.id,
          clickEventId: match.clickId ?? null,
          method: match.method,
          reason: match.reason ?? "one_eligible_journey",
          candidateGroupCount: match.candidateGroupCount,
          elapsedMs: match.elapsedMs ?? null,
          createdAt: receivedAt,
          expiresAt: new Date(now.getTime() + 7 * 86400_000).toISOString(),
        })
        .onConflictDoNothing();
    }
    accepted++;
  }
  return { accepted, duplicates };
}
export async function eraseContext(projectId: string, id: string) {
  const [context] = await db
    .select()
    .from(analyticsContexts)
    .where(
      and(
        eq(analyticsContexts.projectId, projectId),
        eq(analyticsContexts.id, id),
      ),
    )
    .limit(1);
  if (!context) return;
  const events = await db
    .select({ id: analyticsEvents.id })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.projectId, projectId),
        eq(analyticsEvents.contextId, id),
      ),
    );
  for (const event of events)
    await db
      .delete(analyticsNetworkObservations)
      .where(eq(analyticsNetworkObservations.eventId, event.id));
  await runBatch((tx) => [
    tx
      .insert(analyticsTombstones)
      .values({
        id: crypto.randomUUID(),
        projectId,
        sourceId: context.sourceId,
        contextKey: context.contextKey,
        erasedAt: new Date().toISOString(),
      })
      .onConflictDoNothing(),
    tx
      .delete(analyticsEntries)
      .where(
        and(
          eq(analyticsEntries.projectId, projectId),
          eq(analyticsEntries.contextId, id),
        ),
      ),
    tx
      .delete(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.projectId, projectId),
          eq(analyticsEvents.contextId, id),
        ),
      ),
    tx
      .delete(analyticsContexts)
      .where(
        and(
          eq(analyticsContexts.projectId, projectId),
          eq(analyticsContexts.id, id),
        ),
      ),
  ]);
}

function eventRow({
  event,
  source,
  context,
  sessionId,
  receivedAt,
  sequence,
}: {
  event: JourneyEvent;
  source: NonNullable<Awaited<ReturnType<typeof repo.source>>>;
  context: NonNullable<Awaited<ReturnType<typeof repo.context>>>;
  sessionId: string;
  receivedAt: string;
  sequence: number;
}) {
  return {
    id: crypto.randomUUID(),
    projectId: source.projectId,
    sourceId: source.id,
    environment: source.environment,
    contextId: context.id,
    eventId: event.eventId,
    sessionId,
    name: event.name,
    occurredAt: event.occurredAt,
    receivedAt,
    sequence,
    pageHost: event.page?.host ?? null,
    pagePath: event.page ? safeAnalyticsPath(event.page.path) : null,
    referrerHost: event.referrer?.host ?? null,
    campaignSource: safeCampaign(event.campaign?.source),
    campaignMedium: safeCampaign(event.campaign?.medium),
    campaignName: safeCampaign(event.campaign?.campaign),
    action: event.properties?.action ?? null,
    destination:
      event.name === "product_opened"
        ? source.destination
        : (event.properties?.destination ?? null),
    placement: event.properties?.placement ?? null,
    trust: event.name === "identity_known" ? "verified" : "public",
    policyVersion: event.consent.policyVersion,
  };
}
