import type * as CollectionModule from "./AnalyticsCollection";
import type * as OutcomesModule from "./AnalyticsOutcomes";
import type * as MqlsModule from "./AnalyticsMqls";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { readFileSync } from "node:fs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { now, ids, event } from "./collection-test-fixture";
import { signIdentityAssertion } from "./crypto";

let client: Client;
let db: LibSQLDatabase;
let collect: typeof CollectionModule.collect;
let recordOutcome: typeof OutcomesModule.recordOutcome;
let mqlReport: typeof MqlsModule.mqlReport;
// The connected Google Ads account, faked at the service boundary.
const ads = vi.hoisted(() => ({ clientFor: vi.fn() }));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  vi.doMock("@/db", () => ({ db }));
  vi.doMock("@/server/features/google-ads/GoogleAdsService", () => ({
    GoogleAdsService: ads,
  }));
  vi.doMock("@/db/schema", async () => ({
    ...(await import("@/db/analytics.schema")),
    ...(await import("@/db/analytics-reporting.schema")),
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
      [
        "0073_aspiring_inertia",
        "0074_right_mephisto",
        "0075_panoramic_namora",
        "0076_dazzling_wolf_cub",
        "0079_wandering_zarda",
        "0082_milky_wolfpack",
        "0083_crazy_newton_destine",
      ]
        .map((name) => readFileSync(`drizzle/${name}.sql`, "utf8"))
        .join("\n") +
      `INSERT INTO projects VALUES ('p');
INSERT INTO analytics_settings(project_id,personal_access,weekly_mql_target,updated_at) VALUES ('p',1,45,'2026-09-01');
INSERT INTO analytics_sources VALUES ('${ids.website}','p','00000000-0000-4000-8000-000000000001','website','site.test','production','product',1,'2026-09-01T00:00:00.000Z');`,
  );
  ({ collect } = await import("./AnalyticsCollection"));
  ({ recordOutcome } = await import("./AnalyticsOutcomes"));
  ({ mqlReport } = await import("./AnalyticsMqls"));
});
afterAll(() => {
  client.close();
  vi.useRealTimers();
});

const visitor = "00000000-0000-4000-8000-000000000020";
const send = (events: Parameters<typeof collect>[0]["events"], at: Date) =>
  collect({
    events,
    origin: "https://site.test",
    observedIp: "203.0.113.50",
    userAgent: "Browser/1",
    secrets: { networkSecret: "network", identitySecret: "identity" },
    now: at,
  });
const outcome = (
  name: Parameters<typeof recordOutcome>[0]["name"],
  customerId: string,
  at: Date,
  contextId?: string,
) =>
  recordOutcome({
    projectId: "p",
    sourceId: ids.website,
    environment: "production",
    eventId: `${customerId}:${name}`,
    issuer: "yakchat-website",
    customerId,
    ...(contextId ? { contextId } : {}),
    name,
    occurredAt: at.toISOString(),
  });

beforeEach(() => {
  ads.clientFor.mockResolvedValue(null);
});

describe("mqlReport", () => {
  it("counts qualified leads per week against the target, splits demo enquiries from trials, and attributes each to its first touch", async () => {
    const landed = new Date(now.getTime() - 2 * 3600_000);
    await send(
      [
        event({
          eventId: crypto.randomUUID(),
          name: "page_view",
          properties: undefined,
          page: { host: "site.test", path: "/sms-for-microsoft-teams" },
          referrer: { host: "www.google.com", path: "/" },
          campaign: {
            source: "google",
            medium: "cpc",
            campaign: "teams-sms",
            term: "teams sms",
            content: "ad-1",
          },
          clickId: { type: "gclid", value: "Cj0KCQ-test_click.id" },
          occurredAt: landed.toISOString(),
        }),
        event({
          eventId: crypto.randomUUID(),
          name: "page_view",
          properties: undefined,
          page: { host: "site.test", path: "/book-a-demo" },
          referrer: { host: "site.test", path: "/sms-for-microsoft-teams" },
          occurredAt: landed.toISOString(),
        }),
      ],
      landed,
    );
    // The site identifies the visitor at booking (its identity assertion).
    const assertion = await signIdentityAssertion(
      {
        projectId: "p",
        sourceId: ids.website,
        contextId: visitor,
        issuer: "yakchat-website",
        userId: "user-demo",
        organizationId: "org-demo",
        purpose: "identity",
        aud: "journey-analytics",
      },
      "identity",
    );
    await send(
      [
        event({
          eventId: ids.identity,
          name: "identity_known",
          properties: undefined,
          page: { host: "site.test", path: "/book-a-demo" },
          identityAssertion: assertion,
        }),
      ],
      now,
    );
    // A demo booked on the site (with its visitor), and a trial with no tracked journey.
    await outcome("enquiry_submitted", "org-demo", now, visitor);
    await outcome("lead_qualified", "org-demo", now, visitor);
    await outcome("trial_started", "org-trial", now);
    await outcome("lead_qualified", "org-trial", now);
    await outcome("enquiry_submitted", "org-question", now);

    const report = await mqlReport({
      projectId: "p",
      environment: "production",
      from: new Date(now.getTime() - 7 * 86400_000).toISOString(),
      to: new Date(now.getTime() + 3600_000).toISOString(),
      timezone: "UTC",
      limit: 100,
      offset: 0,
    });

    expect(report).toMatchObject({
      target: 45,
      total: 2,
      enquiries: 1,
      trials: 1,
      untracked: 1,
    });
    expect(report.weekly.find((w) => w.week === "2026-09-14")).toEqual({
      week: "2026-09-14",
      mqls: 2,
      enquiries: 1,
      trials: 1,
    });
    expect(report.byChannel).toContainEqual({ label: "Paid search", mqls: 1 });
    expect(report.byCampaign).toEqual([
      { label: "google / cpc / teams-sms", mqls: 1 },
    ]);
    const demo = report.leads?.find((l) => l.kind === "enquiry");
    expect(demo).toMatchObject({
      pagesViewed: 2,
      channel: "Paid search",
      firstTouch: {
        landingPage: "/sms-for-microsoft-teams",
        source: "google",
        campaign: "teams-sms",
        content: "ad-1",
        term: "teams sms",
        referrer: "www.google.com/",
        clickIdType: "gclid",
      },
    });
  });

  it("adds Google Ads spend and cost per qualified lead, placing an ad click's lead in its campaign", async () => {
    const clickCampaign = vi.fn().mockResolvedValue({
      campaignId: "111",
      campaignName: "Teams SMS UK",
      adGroupName: "Teams texting",
      keyword: "teams sms",
    });
    ads.clientFor.mockResolvedValue({
      connection: {
        timeZone: "Europe/London",
        customerName: "YakChat",
        currencyCode: "GBP",
      },
      account: { customerId: "1234567890", loginCustomerId: null },
      client: {
        campaignSpend: vi.fn().mockResolvedValue([
          {
            campaignId: "111",
            campaignName: "Teams SMS UK",
            spend: 300,
            clicks: 120,
            impressions: 4000,
          },
          {
            campaignId: "222",
            campaignName: "Brand",
            spend: 50,
            clicks: 40,
            impressions: 900,
          },
        ]),
        clickCampaign,
      },
    });
    const report = await mqlReport({
      projectId: "p",
      environment: "production",
      from: new Date(now.getTime() - 7 * 86400_000).toISOString(),
      to: new Date(now.getTime() + 3600_000).toISOString(),
      timezone: "UTC",
      limit: 100,
      offset: 0,
    });
    expect(clickCampaign).toHaveBeenCalledWith(
      { customerId: "1234567890", loginCustomerId: null },
      "Cj0KCQ-test_click.id",
      "2026-09-15",
    );
    expect(report.ads).toMatchObject({
      connected: true,
      currency: "GBP",
      spend: 350,
      mqls: 1,
      costPerMql: 350,
    });
    if (!("campaigns" in report.ads)) throw new Error("expected campaigns");
    expect(report.ads.campaigns[0]).toMatchObject({
      campaignName: "Teams SMS UK",
      spend: 300,
      mqls: 1,
      enquiries: 1,
      costPerMql: 300,
    });
    expect(report.ads.campaigns[1]).toMatchObject({
      campaignName: "Brand",
      mqls: 0,
      costPerMql: null,
    });
    const demo = report.leads?.find((l) => l.kind === "enquiry");
    expect(demo?.adCampaign).toMatchObject({
      campaignName: "Teams SMS UK",
      keyword: "teams sms",
    });
    // The raw click id stays inside the report.
    expect(JSON.stringify(report)).not.toContain("Cj0KCQ-test_click.id");
  });

  it("keeps individual leads out unless the project allows personal inspection", async () => {
    await client.execute("UPDATE analytics_settings SET personal_access = 0");
    const report = await mqlReport({
      projectId: "p",
      environment: "production",
      timezone: "UTC",
      limit: 100,
      offset: 0,
    });
    expect(report.leads).toBeNull();
    expect(report.total).toBe(2);
  });
});
