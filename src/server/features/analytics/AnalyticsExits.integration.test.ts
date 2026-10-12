import type * as CollectionModule from "./AnalyticsCollection";
import type * as OutcomesModule from "./AnalyticsOutcomes";
import type * as ExitsModule from "./AnalyticsExits";
import type { JourneyEvent } from "@/types/schemas/analytics";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { now, ids, event } from "./collection-test-fixture";
import { analyticsMigrationSql } from "./collection-test-fixture-db";
import { signIdentityAssertion } from "./crypto";

let client: Client;
let db: LibSQLDatabase;
let collect: typeof CollectionModule.collect;
let recordOutcome: typeof OutcomesModule.recordOutcome;
let exitsReport: typeof ExitsModule.exitsReport;

beforeAll(async () => {
  // Keep signed assertions on the fixture's clock.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
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
  await client.executeMultiple(
    "CREATE TABLE projects (id text primary key);" +
      analyticsMigrationSql() +
      `INSERT INTO projects VALUES ('p');
INSERT INTO analytics_settings(project_id,updated_at) VALUES ('p','2026-09-01');
INSERT INTO analytics_sources VALUES ('${ids.website}','p','00000000-0000-4000-8000-000000000001','website','site.test','production','product',1,'2026-09-01T00:00:00.000Z');
INSERT INTO analytics_actions VALUES ('a','p','start_trial','product');`,
  );
  ({ collect } = await import("./AnalyticsCollection"));
  ({ recordOutcome } = await import("./AnalyticsOutcomes"));
  ({ exitsReport } = await import("./AnalyticsExits"));
});
afterAll(() => {
  client.close();
  vi.useRealTimers();
});

const adVisitor = "00000000-0000-4000-8000-0000000000a1";
const browser = "00000000-0000-4000-8000-0000000000b1";
const lead = "00000000-0000-4000-8000-0000000000c1";
const hoursFromNow = (hours: number) =>
  new Date(now.getTime() + hours * 3600_000);

const view = (
  path: string,
  overrides: Partial<JourneyEvent> = {},
): Partial<JourneyEvent> => ({
  name: "page_view",
  properties: undefined,
  page: { host: "site.test", path },
  ...overrides,
});
/** One batch of events from one visitor. */
const visit = (contextId: string, at: Date, events: Partial<JourneyEvent>[]) =>
  collect({
    events: events.map((overrides) =>
      event({
        eventId: crypto.randomUUID(),
        contextId,
        occurredAt: at.toISOString(),
        ...overrides,
      }),
    ),
    origin: "https://site.test",
    observedIp: "203.0.113.50",
    userAgent: "Browser/1",
    secrets: { networkSecret: "network", identitySecret: "identity" },
    now: at,
  });

it("shows where visits end, and which of them left without acting, for all visits and by channel", async () => {
  // An ad visitor reads two pages and leaves on pricing...
  await visit(adVisitor, hoursFromNow(-5), [
    view("/sms-for-teams", {
      campaign: { source: "google", medium: "cpc", campaign: "teams-sms" },
      clickId: { type: "gclid", value: "Cj0KCQ-test_click.id" },
    }),
    view("/pricing"),
  ]);
  // ...then comes back an hour later and starts a trial from pricing.
  await visit(adVisitor, hoursFromNow(-4), [
    view("/pricing"),
    { name: "acquisition_clicked" },
  ]);
  // Someone sees pricing and nothing else.
  await visit(browser, hoursFromNow(-3), [view("/pricing")]);
  // A visitor books a demo and becomes a qualified lead...
  await visit(lead, now, [
    view("/book-a-demo"),
    {
      name: "identity_known",
      properties: undefined,
      page: { host: "site.test", path: "/book-a-demo" },
      identityAssertion: await signIdentityAssertion(
        {
          projectId: "p",
          sourceId: ids.website,
          contextId: lead,
          issuer: "yakchat-website",
          userId: "user-demo",
          organizationId: "org-demo",
          purpose: "identity",
          aud: "journey-analytics",
        },
        "identity",
      ),
    },
  ]);
  await recordOutcome({
    projectId: "p",
    sourceId: ids.website,
    environment: "production",
    eventId: "org-demo:lead_qualified",
    issuer: "yakchat-website",
    customerId: "org-demo",
    contextId: lead,
    name: "lead_qualified",
    occurredAt: now.toISOString(),
  });
  // ...and later reads two more pages. Leaving then is not a visit lost.
  await visit(lead, hoursFromNow(1), [
    view("/pricing"),
    view("/sms-for-teams"),
  ]);

  // What Clarity measured on pricing that day (the daily snapshot's row).
  await client.execute(
    `INSERT INTO analytics_clarity_pages (id, project_id, day, page_path, sessions, scroll_depth, rage_click_pct) VALUES ('c1', 'p', '${now.toISOString().slice(0, 10)}', '/pricing', 40, 50, 2.5)`,
  );

  const report = await exitsReport({
    projectId: "p",
    environment: "production",
    from: hoursFromNow(-24).toISOString(),
    to: hoursFromNow(2).toISOString(),
    timezone: "UTC",
    limit: 100,
    offset: 0,
  });

  expect(report.visits).toBe(5);
  expect(report.clarityDays).toBe(1);
  expect(report.pages[0]).toMatchObject({
    path: "/pricing",
    visits: 4,
    exits: 3,
    exitRate: 75,
    onlyPage: 2,
    leftWithoutActing: 2,
    // Joined by page path; a measure Clarity had none of stays null.
    clarity: {
      sessions: 40,
      scrollDepth: 50,
      rageClickPct: 2.5,
      deadClickPct: null,
    },
  });
  expect(report.pages).toContainEqual({
    path: "/sms-for-teams",
    visits: 2,
    exits: 1,
    exitRate: 50,
    onlyPage: 0,
    leftWithoutActing: 0,
    clarity: null,
  });
  expect(report.pages).toContainEqual({
    path: "/book-a-demo",
    visits: 1,
    exits: 1,
    exitRate: 100,
    onlyPage: 1,
    leftWithoutActing: 0,
    clarity: null,
  });
  expect(report.byChannel.map((row) => [row.channel, row.visits])).toEqual([
    ["Paid search", 2],
    ["Direct", 3],
  ]);
  expect(report.byChannel[0]?.pages[0]).toMatchObject({
    path: "/pricing",
    visits: 2,
    exits: 2,
    exitRate: 100,
    onlyPage: 1,
    leftWithoutActing: 1,
    clarity: { scrollDepth: 50 },
  });
});
