import type * as CollectionModule from "./AnalyticsCollection";
import type * as OutcomesModule from "./AnalyticsOutcomes";
import type * as CryptoModule from "./crypto";
import * as schema from "@/db/analytics.schema";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { now, ids, event } from "./collection-test-fixture";
import { analyticsMigrationSql } from "./collection-test-fixture-db";

let client: Client;
let collect: typeof CollectionModule.collect;
let recordOutcome: typeof OutcomesModule.recordOutcome;
let signIdentityAssertion: typeof CryptoModule.signIdentityAssertion;

beforeAll(async () => {
  // Keep expiry queries and signed assertions on the fixture's clock.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/schema", async () => ({
    ...(await import("@/db/analytics.schema")),
    ...(await import("@/db/analytics-reporting.schema")),
  }));
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (build: (tx: typeof testDb) => Promise<unknown>[]) => {
      const statements = build(testDb);
      if (statements.length)
        await testDb.batch(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          statements as unknown as Parameters<typeof testDb.batch>[0],
        );
    },
  }));
  await client.executeMultiple(
    [
      "CREATE TABLE projects (id text primary key);",
      analyticsMigrationSql(),
      `
INSERT INTO projects VALUES ('p');
INSERT INTO analytics_settings(project_id,business_model,primary_outcome,matching_window_hours,retention_days,personal_access,webhook_url,updated_at) VALUES ('p','organisation','registration_completed',24,90,1,NULL,'2026-09-01T00:00:00.000Z');
INSERT INTO analytics_sources VALUES ('${ids.website}','p','00000000-0000-4000-8000-000000000001','website','site.test','production','product',1,'2026-09-01T00:00:00.000Z');
INSERT INTO analytics_sources VALUES ('${ids.product}','p','00000000-0000-4000-8000-000000000002','product','app.test','production','product',1,'2026-09-01T00:00:00.000Z');
INSERT INTO analytics_actions VALUES ('a','p','start_trial','product');`,
    ].join("\n"),
  );
  ({ collect } = await import("./AnalyticsCollection"));
  ({ recordOutcome } = await import("./AnalyticsOutcomes"));
  ({ signIdentityAssertion } = await import("./crypto"));
});
afterAll(() => {
  client.close();
  vi.useRealTimers();
});
describe("analytics collection integration", () => {
  it("stores a configured click once and creates an inferred provisional entry", async () => {
    const input = {
      events: [event()],
      origin: "https://site.test",
      observedIp: "192.0.2.1",
      secrets: { networkSecret: "network" },
      now,
    };
    expect(await collect(input)).toEqual({ accepted: 1, duplicates: 0 });
    expect(await collect(input)).toEqual({ accepted: 0, duplicates: 1 });
    const product = event({
      eventId: ids.entry,
      sourceId: ids.product,
      projectKey: "00000000-0000-4000-8000-000000000002",
      contextId: "00000000-0000-4000-8000-000000000021",
      name: "product_opened",
      page: { host: "app.test", path: "/" },
      properties: undefined,
    });
    await collect({
      events: [product],
      origin: "https://app.test",
      observedIp: "192.0.2.1",
      secrets: { networkSecret: "network" },
      now: new Date(now.getTime() + 60_000),
    });
    const entries = await (await import("@/db")).db
      .select()
      .from(schema.analyticsEntries);
    expect(entries[0]).toMatchObject({
      method: "ip_time",
      candidateGroupCount: 1,
    });
  });
  it("binds verified identity then records an authoritative customer outcome", async () => {
    const assertion = await signIdentityAssertion(
      {
        projectId: "p",
        sourceId: ids.product,
        contextId: "00000000-0000-4000-8000-000000000021",
        issuer: "issuer",
        userId: "user",
        organizationId: "org",
        purpose: "identity",
        aud: "journey-analytics",
      },
      "identity",
    );
    await collect({
      events: [
        event({
          eventId: ids.identity,
          sourceId: ids.product,
          projectKey: "00000000-0000-4000-8000-000000000002",
          contextId: "00000000-0000-4000-8000-000000000021",
          name: "identity_known",
          page: { host: "app.test", path: "/" },
          properties: undefined,
          identityAssertion: assertion,
        }),
      ],
      origin: "https://app.test",
      observedIp: null,
      secrets: { identitySecret: "identity" },
      now,
    });
    const result = await recordOutcome({
      projectId: "p",
      sourceId: ids.product,
      environment: "production",
      eventId: "outcome-1",
      issuer: "issuer",
      customerId: "org",
      contextId: "00000000-0000-4000-8000-000000000021",
      name: "registration_completed",
      occurredAt: now.toISOString(),
    });
    expect(result.duplicate).toBe(false);
    expect(
      (
        await recordOutcome({
          projectId: "p",
          sourceId: ids.product,
          environment: "production",
          eventId: "outcome-1",
          issuer: "issuer",
          customerId: "org",
          contextId: "00000000-0000-4000-8000-000000000021",
          name: "registration_completed",
          occurredAt: now.toISOString(),
        })
      ).duplicate,
    ).toBe(true);
    await recordOutcome({
      projectId: "p",
      sourceId: ids.product,
      environment: "production",
      eventId: "outcome-2",
      issuer: "issuer",
      customerId: "org",
      contextId: "00000000-0000-4000-8000-000000000021",
      name: "registration_completed",
      occurredAt: now.toISOString(),
    });
    const db = (await import("@/db")).db;
    const customerRows = await db
      .select()
      .from(schema.analyticsCustomers)
      .where(eq(schema.analyticsCustomers.externalId, "org"));
    expect(customerRows).toHaveLength(1);
    expect(customerRows[0]).toMatchObject({
      method: "ip_time",
      acquiredAt: now.toISOString(),
    });
    expect(await db.select().from(schema.analyticsAttributions)).toHaveLength(
      1,
    );
    expect(await db.select().from(schema.analyticsOutbox)).toHaveLength(2);
  });
  it("marks independent same-network clicks ambiguous and leaves unmatched entries unattributed", async () => {
    const second = event({
      eventId: "00000000-0000-4000-8000-000000000103",
      contextId: "00000000-0000-4000-8000-000000000022",
    });
    const third = event({
      eventId: "00000000-0000-4000-8000-000000000108",
      contextId: "00000000-0000-4000-8000-000000000026",
    });
    await collect({
      events: [second, third],
      origin: "https://site.test",
      observedIp: "198.51.100.1",
      secrets: { networkSecret: "network" },
      now,
    });
    const unmatched = event({
      eventId: "00000000-0000-4000-8000-000000000104",
      contextId: "00000000-0000-4000-8000-000000000023",
      sourceId: ids.product,
      projectKey: "00000000-0000-4000-8000-000000000002",
      name: "product_opened",
      page: { host: "app.test", path: "/" },
      properties: undefined,
    });
    await collect({
      events: [unmatched],
      origin: "https://app.test",
      observedIp: "203.0.113.7",
      secrets: { networkSecret: "network" },
      now,
    });
    const ambiguous = event({
      eventId: "00000000-0000-4000-8000-000000000105",
      contextId: "00000000-0000-4000-8000-000000000024",
      sourceId: ids.product,
      projectKey: "00000000-0000-4000-8000-000000000002",
      name: "product_opened",
      page: { host: "app.test", path: "/" },
      properties: undefined,
    });
    await collect({
      events: [ambiguous],
      origin: "https://app.test",
      observedIp: "198.51.100.1",
      secrets: { networkSecret: "network" },
      now,
    });
    const db = (await import("@/db")).db;
    const entries = await db.select().from(schema.analyticsEntries);
    expect(
      entries.find(
        (e) => e.contextId !== undefined && e.reason === "no_candidate",
      ),
    ).toBeTruthy();
    expect(entries.find((e) => e.reason === "ambiguous")).toMatchObject({
      candidateGroupCount: 2,
      clickEventId: null,
    });
  });
  it("does not store denied events and withdrawal erases the context evidence", async () => {
    const denied = event({
      eventId: "00000000-0000-4000-8000-000000000106",
      contextId: "00000000-0000-4000-8000-000000000025",
      consent: {
        analytics: false,
        attribution: false,
        identity: false,
        policyVersion: "v2",
      },
    });
    expect(
      await collect({
        events: [denied],
        origin: "https://site.test",
        observedIp: "192.0.2.9",
        secrets: { networkSecret: "network" },
        now,
      }),
    ).toEqual({ accepted: 0, duplicates: 0 });
    const withdrawal = event({
      eventId: "00000000-0000-4000-8000-000000000107",
      contextId: "00000000-0000-4000-8000-000000000021",
      sourceId: ids.product,
      projectKey: "00000000-0000-4000-8000-000000000002",
      name: "consent_withdrawn",
      page: undefined,
      properties: undefined,
      consent: {
        analytics: false,
        attribution: false,
        identity: false,
        policyVersion: "v2",
      },
    });
    await collect({
      events: [withdrawal],
      origin: "https://app.test",
      observedIp: null,
      secrets: {},
      now,
    });
    const db = (await import("@/db")).db;
    expect(
      await db
        .select()
        .from(schema.analyticsContexts)
        .where(
          eq(
            schema.analyticsContexts.contextKey,
            "00000000-0000-4000-8000-000000000021",
          ),
        ),
    ).toHaveLength(0);
  });
});

it("deduplicates payment notifications and prevents over-refunding", async () => {
  const payment = {
    projectId: "p",
    sourceId: ids.product,
    environment: "production" as const,
    eventId: "invoice-1",
    issuer: "issuer",
    customerId: "org",
    name: "payment_succeeded" as const,
    occurredAt: now.toISOString(),
    amountMinor: 12000,
    currency: "USD",
    paymentId: "pay-1",
  };
  expect((await recordOutcome(payment)).duplicate).toBe(false);
  expect(
    (await recordOutcome({ ...payment, eventId: "invoice-alternate" }))
      .duplicate,
  ).toBe(true);
  await recordOutcome({
    ...payment,
    eventId: "refund-1",
    name: "refund_issued",
    amountMinor: 2000,
  });
  await expect(
    recordOutcome({
      ...payment,
      eventId: "refund-2",
      name: "refund_issued",
      amountMinor: 11000,
    }),
  ).rejects.toThrow("Refund exceeds");
  const rows = await (await import("@/db")).db
    .select()
    .from(schema.analyticsOutcomes);
  expect(rows.filter((r) => r.name === "payment_succeeded")).toHaveLength(1);
  expect(rows.filter((r) => r.name === "refund_issued")).toHaveLength(1);
});
it("rejects forged identity and keeps same public context ids scoped to their source", async () => {
  const contextId = crypto.randomUUID();
  const base = event({
    eventId: crypto.randomUUID(),
    contextId,
    name: "page_view",
    properties: undefined,
  });
  await collect({
    events: [base],
    origin: "https://site.test",
    observedIp: null,
    secrets: {},
    now,
  });
  await collect({
    events: [
      {
        ...base,
        eventId: crypto.randomUUID(),
        sourceId: ids.product,
        projectKey: "00000000-0000-4000-8000-000000000002",
        page: { host: "app.test", path: "/" },
      },
    ],
    origin: "https://app.test",
    observedIp: null,
    secrets: {},
    now,
  });
  const rows = await (await import("@/db")).db
    .select()
    .from(schema.analyticsContexts)
    .where(eq(schema.analyticsContexts.contextKey, contextId));
  expect(rows).toHaveLength(2);
  expect(rows[0]?.id).not.toBe(rows[1]?.id);
  await expect(
    collect({
      events: [
        {
          ...base,
          eventId: crypto.randomUUID(),
          name: "identity_known",
          identityAssertion: "forged",
        },
      ],
      origin: "https://site.test",
      observedIp: null,
      secrets: { identitySecret: "identity" },
      now,
    }),
  ).rejects.toThrow();
});

it("retains one event and no orphan network observations during concurrent retries", async () => {
  const retry = event({
    eventId: crypto.randomUUID(),
    contextId: crypto.randomUUID(),
  });
  const results = await Promise.all(
    [0, 1].map(() =>
      collect({
        events: [retry],
        origin: "https://site.test",
        observedIp: "192.0.2.90",
        secrets: { networkSecret: "network" },
        now,
      }),
    ),
  );
  expect(results.reduce((total, r) => total + r.accepted, 0)).toBe(1);
  const orphan = await client.execute(
    "SELECT count(*) AS n FROM analytics_network_observations n LEFT JOIN analytics_events e ON n.event_id=e.id WHERE e.id IS NULL",
  );
  expect(orphan.rows[0].n).toBe(0);
});
