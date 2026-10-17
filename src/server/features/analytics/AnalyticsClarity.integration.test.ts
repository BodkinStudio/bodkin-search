import type * as ClarityModule from "./AnalyticsClarity";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { analyticsMigrationSql } from "./collection-test-fixture-db";

let client: Client;
let db: LibSQLDatabase;
let clarity: typeof ClarityModule;

beforeAll(async () => {
  vi.stubEnv("ANALYTICS_SERVER_EVENT_SECRET", "deployment-root");
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  vi.doMock("@/db", () => ({ db }));
  vi.doMock("@/db/schema", async () => ({
    ...(await import("@/db/analytics.schema")),
    ...(await import("@/db/analytics-reporting.schema")),
    ...(await import("@/db/analytics-clarity.schema")),
  }));
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (build: (tx: typeof db) => Promise<unknown>[]) => {
      const statements = build(db);
      if (statements.length)
        await db.batch(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          statements as unknown as Parameters<typeof db.batch>[0],
        );
    },
  }));
  // Project p tracks www.site.test live and a staging host in test; project q tracks q.test.
  await client.executeMultiple(
    "CREATE TABLE projects (id text primary key);" +
      analyticsMigrationSql() +
      `INSERT INTO projects VALUES ('p'), ('q');
INSERT INTO analytics_sources VALUES ('00000000-0000-4000-8000-000000000010','p','00000000-0000-4000-8000-000000000001','website','www.site.test','production','product',1,'2026-09-01T00:00:00.000Z');
INSERT INTO analytics_sources VALUES ('00000000-0000-4000-8000-000000000011','p','00000000-0000-4000-8000-000000000002','website','staging.site.test','test','product',1,'2026-09-01T00:00:00.000Z');
INSERT INTO analytics_sources VALUES ('00000000-0000-4000-8000-000000000012','q','00000000-0000-4000-8000-000000000003','website','q.test','production','product',1,'2026-09-01T00:00:00.000Z');`,
  );
  clarity = await import("./AnalyticsClarity");
});
afterAll(() => {
  client.close();
  vi.unstubAllEnvs();
});

const part = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
// A Data Export token's subject is its Clarity project ID as a number; this
// one was made in project "ywle6ybum7".
const token = `${part({ alg: "RS256" })}.${part({ sub: "3544990586620351", scope: "Data.Export" })}.signature-not-checked-here`;
const otherToken = `${part({ alg: "RS256" })}.${part({ scope: "Data.Export" })}.another-projects-signature`;
const period = (projectId: string) => ({
  projectId,
  environment: "production" as const,
  from: "2026-09-10T00:00:00.000Z",
  to: "2026-09-20T00:00:00.000Z",
  timezone: "UTC",
  limit: 100,
  offset: 0,
});
const night = (day: number) => new Date(`2026-09-${day}T03:17:00.000Z`);

type Page = {
  url: string;
  sessions: number;
  bots?: number;
  scroll?: number;
  rage?: string;
};
/** Clarity's reply for one day, in the shapes it sends: numbers, numeric strings and nulls. */
const reply = (pages: Page[]) =>
  new Response(
    JSON.stringify([
      {
        metricName: "Traffic",
        information: pages.map((page) => ({
          Url: page.url,
          totalSessionCount: String(page.sessions),
          totalBotSessionCount: page.bots ?? null,
        })),
      },
      {
        metricName: "ScrollDepth",
        information: pages.flatMap((page) =>
          page.scroll === undefined
            ? []
            : [{ Url: page.url, averageScrollDepth: page.scroll }],
        ),
      },
      {
        metricName: "RageClickCount",
        information: pages.flatMap((page) =>
          page.rage === undefined
            ? []
            : [{ Url: page.url, sessionsWithMetricPercentage: page.rage }],
        ),
      },
      { metricName: "DeadClickCount", information: [] },
      { metricName: "EngagementTime", information: [{ activeTime: null }] },
    ]),
  );
const connectionOf = (projectId: string) =>
  clarity.clarityConnection(projectId);

it("keeps the token encrypted, hands back only the connection's status, and says when the token was made in another Clarity project", async () => {
  const saved = await clarity.saveClarityConnection(
    { projectId: "p", clarityProjectId: "pfzss85hkv", token },
    "user-1",
  );
  // Exactly these fields: nothing of the stored row beyond them.
  expect(Object.keys(saved.connection ?? {}).toSorted()).toEqual([
    "clarityProjectId",
    "lastSyncError",
    "lastSyncedAt",
    "updatedAt",
  ]);
  expect(saved.connection).toMatchObject({
    clarityProjectId: "pfzss85hkv",
    lastSyncedAt: null,
    lastSyncError: null,
  });
  expect(saved.warning).toContain("ywle6ybum7");

  const stored = await client.execute(
    "SELECT * FROM analytics_clarity_connections",
  );
  const audit = await client.execute("SELECT * FROM analytics_audit");
  for (const everything of [saved, stored.rows, audit.rows]) {
    const text = JSON.stringify(everything);
    expect(text).not.toContain(token);
    expect(text).not.toContain(Buffer.from(token).toString("base64"));
  }
  expect(audit.rows).toContainEqual(
    expect.objectContaining({ field: "token", next_value: "replaced" }),
  );
});

it("snapshots a day of pages on the live tracked sites, weighted by sessions, and replaces the day when run again", async () => {
  const asked: { url: string; authorization: string | null }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    asked.push({
      url: request.url,
      authorization: request.headers.get("authorization"),
    });
    return reply([
      // Three addresses of one page; the middle one has no scroll figure.
      {
        url: "https://www.site.test/pricing",
        sessions: 30,
        bots: 3,
        scroll: 60,
        rage: "10",
      },
      { url: "https://www.site.test/pricing?gclid=abc", sessions: 10 },
      { url: "https://site.test/pricing?utm=ad", sessions: 10, scroll: 20 },
      // Not this project's live sites.
      { url: "https://elsewhere.test/pricing", sessions: 99, scroll: 1 },
      { url: "https://staging.site.test/pricing", sessions: 99, scroll: 1 },
      // Enough pages to need several insert statements.
      ...Array.from({ length: 25 }, (_, i) => ({
        url: `https://www.site.test/guide-${String.fromCharCode(97 + i)}`,
        sessions: 1,
      })),
    ]);
  };
  await clarity.syncClarityPages(night(16), fetchImpl);
  await clarity.syncClarityPages(night(16), fetchImpl);

  // The stored token comes back out for the request, and only there.
  expect(asked[0]?.url).toContain("numOfDays=1&dimension1=URL");
  expect(asked[0]?.authorization).toBe(`Bearer ${token}`);

  const rows = await client.execute(
    "SELECT * FROM analytics_clarity_pages ORDER BY sessions DESC",
  );
  expect(rows.rows).toHaveLength(26);
  expect(rows.rows[0]).toMatchObject({
    day: "2026-09-15",
    page_path: "/pricing",
    sessions: 50,
    bot_sessions: 3,
    // (60 x 30 sessions + 20 x 10 sessions) / the 40 sessions that have one
    scroll_depth: 50,
    rage_click_pct: 10,
    dead_click_pct: null,
    active_time: null,
  });
  expect(await connectionOf("p")).toMatchObject({
    lastSyncedAt: night(16).toISOString(),
    lastSyncError: null,
  });

  // Two more days: one small with a scroll figure, one large with none.
  await clarity.syncClarityPages(night(17), async () =>
    reply([{ url: "https://www.site.test/pricing", sessions: 10, scroll: 20 }]),
  );
  await clarity.syncClarityPages(night(18), async () =>
    reply([{ url: "https://www.site.test/pricing", sessions: 60 }]),
  );
  const read = await clarity.clarityPages(period("p"));
  expect(read.days).toBe(3);
  // Scroll: (50 x 50 + 20 x 10) / the 60 sessions on days that have one.
  expect(read.pages.get("/pricing")).toMatchObject({
    sessions: 120,
    botSessions: 3,
    scrollDepth: 45,
    deadClickPct: null,
  });
  // Clarity is on the live site, so a test report has none of it.
  expect(
    (await clarity.clarityPages({ ...period("p"), environment: "test" })).days,
  ).toBe(0);
});

it("records one project's failure in safe words, keeps its days, and still snapshots the others", async () => {
  await clarity.saveClarityConnection(
    { projectId: "q", clarityProjectId: "qqqqqqqqqq", token: otherToken },
    "user-1",
  );
  await clarity.syncClarityPages(night(19), async (input, init) =>
    new Request(input, init).headers.get("authorization") === `Bearer ${token}`
      ? new Response("{}", { status: 429 })
      : reply([{ url: "https://q.test/", sessions: 7 }]),
  );
  expect((await connectionOf("p"))?.lastSyncError).toContain(
    "daily request limit",
  );
  expect((await clarity.clarityPages(period("p"))).days).toBe(3);
  expect(await connectionOf("q")).toMatchObject({
    lastSyncedAt: night(19).toISOString(),
    lastSyncError: null,
  });
  expect(
    (await clarity.clarityPages(period("q"))).pages.get("/"),
  ).toMatchObject({ sessions: 7 });
});

it("treats a snapshot with no pages as a fault, without overwriting the day it already has", async () => {
  await clarity.syncClarityPages(night(19), async () => reply([]));
  expect((await connectionOf("q"))?.lastSyncError).toContain("no pages");
  expect((await clarity.clarityPages(period("q"))).days).toBe(1);
});

it("cannot read a stored token under a different deployment secret, and keeps the reason out of what it records", async () => {
  vi.stubEnv("ANALYTICS_SERVER_EVENT_SECRET", "a-different-root");
  const fetchImpl = vi.fn<typeof fetch>();
  await clarity.syncClarityPages(night(20), fetchImpl);
  vi.stubEnv("ANALYTICS_SERVER_EVENT_SECRET", "deployment-root");

  expect(fetchImpl).not.toHaveBeenCalled();
  expect((await connectionOf("p"))?.lastSyncError).toBe(
    "Clarity could not be read.",
  );
});
