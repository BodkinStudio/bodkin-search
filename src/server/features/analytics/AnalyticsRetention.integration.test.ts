import type * as RetentionModule from "./AnalyticsRetention";
import type * as ErasureModule from "./AnalyticsErasure";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
let client: Client;
let retention: typeof RetentionModule;
let erasure: typeof ErasureModule;
beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/schema", async () => ({
    ...(await import("@/db/analytics.schema")),
    ...(await import("@/db/analytics-reporting.schema")),
  }));
  vi.doMock("cloudflare:workers", () => ({
    env: { ANALYTICS_ERASURE_HMAC_SECRET: "test-erasure-key" },
  }));
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (
      build: (tx: typeof testDb) => readonly Promise<unknown>[],
    ) => {
      const statements = build(testDb);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- real SQLite Drizzle executor at the production DB boundary
      if (statements.length)
        await testDb.batch(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- DB seam accepts real batch builders
          statements as unknown as Parameters<typeof testDb.batch>[0],
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
        .join("\n"),
  );
  await client.executeMultiple(`INSERT INTO projects VALUES ('retention');
    INSERT INTO analytics_settings(project_id,updated_at) VALUES ('retention','2026-09-15');
    INSERT INTO analytics_sources(id,project_id,public_key,kind,hostname,created_at) VALUES ('source','retention','key','server','test.example','2026-01-01');
    INSERT INTO analytics_customers(id,project_id,environment,issuer,external_id,first_seen_at) VALUES ('customer','retention','production','issuer','external','2026-01-01');
    INSERT INTO analytics_contexts(id,project_id,source_id,context_key,environment,created_at,last_seen_at,session_id,policy_version,customer_id) VALUES ('context','retention','source','context-key','production','2026-01-01','2026-01-01','session','1','customer');
    INSERT INTO analytics_events(id,project_id,source_id,environment,context_id,event_id,session_id,name,occurred_at,received_at,policy_version) VALUES ('event','retention','source','production','context','external-event','session','page_view','2026-01-01','2026-01-01','1');`);
  retention = await import("./AnalyticsRetention");
  erasure = await import("./AnalyticsErasure");
});
afterAll(() => client.close());
it("archives raw history exactly once and expires rollups after thirteen months", async () => {
  await retention.purgeExpired(new Date("2026-09-15T12:00:00Z"));
  await retention.purgeExpired(new Date("2026-09-15T12:00:00Z"));
  const history = await retention.retainedDailyHistory(
    "retention",
    "production",
    "2026-01-01",
    "2026-09-15",
  );
  expect(history.find((r) => r.metric === "visitor_days")?.value).toBe(1);
  expect(history.find((r) => r.metric === "page_views")?.value).toBe(1);
  expect(
    (await client.execute("SELECT * FROM analytics_events")).rows,
  ).toHaveLength(0);
  expect(
    (await client.execute("SELECT * FROM analytics_contexts")).rows,
  ).toHaveLength(0);
  await retention.purgeExpired(new Date("2027-03-15T12:00:00Z"));
  expect(
    (await client.execute("SELECT * FROM analytics_daily_aggregates")).rows,
  ).toHaveLength(0);
});
it("blocks erased external customer keys on no-context outcome replay without raw identity in ledger", async () => {
  await client.execute(
    "INSERT INTO analytics_customers(id,project_id,environment,issuer,external_id,first_seen_at) VALUES ('erased','retention','production','issuer','private-external-id','2026-09-15')",
  );
  await client.executeMultiple(`
    INSERT INTO analytics_contexts(id,project_id,source_id,context_key,environment,created_at,last_seen_at,session_id,policy_version,customer_id) VALUES ('erased-context','retention','source','erased-context-key','production','2026-09-01','2026-09-01','s','1','erased');
    INSERT INTO analytics_events(id,project_id,source_id,environment,context_id,event_id,session_id,name,occurred_at,received_at,policy_version) VALUES ('erased-event','retention','source','production','erased-context','erased-event-key','s','page_view','2026-09-01','2026-09-01','1');
    INSERT INTO analytics_outcomes(id,project_id,environment,issuer,external_id,customer_id,name,occurred_at) VALUES ('erased-outcome','retention','production','issuer','outcome-key','erased','registration_completed','2026-09-01');
    INSERT INTO analytics_outbox(id,project_id,customer_id,version,created_at,next_attempt_at) VALUES ('erased-delivery','retention','erased',1,'2026-09-01','2026-09-01');
    INSERT INTO analytics_claims(click_event_id,customer_id,project_id) VALUES ('erased-event','erased','retention');
    INSERT INTO analytics_attributions(id,project_id,customer_id,version,method,reason,created_at) VALUES ('erased-decision','retention','erased',1,'exact','exact_context','2026-09-01');
  `);
  await erasure.eraseCustomerRecords("retention", "erased");
  for (const table of [
    "analytics_contexts",
    "analytics_events",
    "analytics_outcomes",
    "analytics_outbox",
    "analytics_claims",
    "analytics_attributions",
  ]) {
    expect((await client.execute(`SELECT * FROM ${table}`)).rows).toHaveLength(
      0,
    );
  }
  expect(
    (await client.execute("SELECT context_key FROM analytics_tombstones")).rows,
  ).toContainEqual({ context_key: "erased-context-key" });
  expect(
    JSON.stringify(
      (await client.execute("SELECT * FROM analytics_erasure_keys")).rows,
    ),
  ).not.toContain("private-external-id");
  const { recordOutcome } = await import("./AnalyticsOutcomes");
  await expect(
    recordOutcome({
      projectId: "retention",
      sourceId: "source",
      environment: "production",
      issuer: "issuer",
      customerId: "private-external-id",
      eventId: "replay",
      name: "registration_completed",
      occurredAt: "2026-09-01T00:00:00Z",
    }),
  ).rejects.toThrow("Identity is unavailable");
  expect(
    (
      await client.execute(
        "SELECT * FROM analytics_customers WHERE external_id = 'private-external-id'",
      )
    ).rows,
  ).toHaveLength(0);
  await expect(
    erasure.assertIdentityNotErased({
      projectId: "other",
      environment: "production",
      issuer: "issuer",
      externalId: "private-external-id",
    }),
  ).resolves.toBeUndefined();
});

it("rejects verified identity replay and separates environment-scoped erasure keys", async () => {
  const { bindIdentity } = await import("./AnalyticsAttribution");
  const { signIdentityAssertion } = await import("./crypto");
  const { AnalyticsRepository: repo } = await import("./AnalyticsRepository");
  const assertion = await signIdentityAssertion(
    {
      projectId: "retention",
      sourceId: "source",
      contextId: "new-context",
      issuer: "issuer",
      userId: "user",
      organizationId: "private-external-id",
      purpose: "identity",
      aud: "journey-analytics",
    },
    "identity-secret",
  );
  await client.execute(
    "INSERT INTO analytics_contexts(id,project_id,source_id,context_key,environment,created_at,last_seen_at,session_id,policy_version) VALUES ('new-context','retention','source','new-context','production','2026-09-01','2026-09-01','s','1')",
  );
  const source = await repo.source("source");
  const context = await repo.context("retention", "source", "new-context");
  expect(source).toBeDefined();
  expect(context).toBeDefined();
  const { event } = await import("./collection-test-fixture");
  await expect(
    bindIdentity(
      event({
        contextId: "new-context",
        identityAssertion: assertion,
        consent: {
          analytics: true,
          attribution: true,
          identity: true,
          policyVersion: "1",
        },
      }),
      source,
      context,
      { identitySecret: "identity-secret" },
    ),
  ).rejects.toThrow("Identity is unavailable");
  expect(
    (await repo.context("retention", "source", "new-context"))?.customerId,
  ).toBeNull();
  await expect(
    erasure.assertIdentityNotErased({
      projectId: "retention",
      environment: "test",
      issuer: "issuer",
      externalId: "private-external-id",
    }),
  ).resolves.toBeUndefined();
});

it("archives expired customer totals and currencies atomically without repeat credit", async () => {
  await client.executeMultiple(`
    INSERT INTO projects VALUES ('expired-customer');
    INSERT INTO analytics_settings(project_id,customer_retention_days,updated_at) VALUES ('expired-customer',90,'2026-09-15');
    INSERT INTO analytics_customers(id,project_id,environment,issuer,external_id,first_seen_at,acquired_at) VALUES ('expired-c','expired-customer','production','issuer','external','2026-01-01','2026-05-01');
    INSERT INTO analytics_outcomes(id,project_id,environment,issuer,external_id,customer_id,name,occurred_at,amount_minor,currency,payment_id) VALUES ('receipt','expired-customer','production','issuer','payment','expired-c','payment_succeeded','2026-05-01',1200,'GBP','payment-id');
    INSERT INTO analytics_outcomes(id,project_id,environment,issuer,external_id,customer_id,name,occurred_at,amount_minor,currency,payment_id) VALUES ('refund','expired-customer','production','issuer','refund','expired-c','refund_issued','2026-05-02',200,'GBP','payment-id');
  `);
  await retention.purgeExpired(new Date("2026-09-15T12:00:00Z"));
  await retention.purgeExpired(new Date("2026-09-15T12:00:00Z"));
  const history = await retention.retainedDailyHistory(
    "expired-customer",
    "production",
    "2026-01-01",
    "2026-09-15",
  );
  expect(history.find((r) => r.metric === "receipts_minor")).toMatchObject({
    value: 1200,
    currency: "GBP",
  });
  expect(history.find((r) => r.metric === "refunds_minor")).toMatchObject({
    value: 200,
    currency: "GBP",
  });
  expect(history.find((r) => r.metric === "acquired_customers")?.value).toBe(1);
  expect(
    (
      await client.execute(
        "SELECT * FROM analytics_customers WHERE project_id = 'expired-customer'",
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await client.execute(
        "SELECT * FROM analytics_erasure_keys WHERE project_id = 'expired-customer'",
      )
    ).rows,
  ).toHaveLength(0);
});

it("reapplies the protected ledger to a restored customer before ingestion resumes", async () => {
  await client.execute(
    "INSERT INTO analytics_customers(id,project_id,environment,issuer,external_id,first_seen_at) VALUES ('restored','retention','production','issuer','private-external-id','2026-09-15')",
  );
  expect(await erasure.replayErasureLedger("retention")).toEqual({ erased: 1 });
  expect(
    (
      await client.execute(
        "SELECT * FROM analytics_customers WHERE id = 'restored'",
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await client.execute(
        "SELECT * FROM analytics_erasure_keys WHERE project_id = 'retention'",
      )
    ).rows,
  ).toHaveLength(1);
});

it("does not persist an excluded page or its context, while accepting a sibling path", async () => {
  const { collect } = await import("./AnalyticsCollection");
  const { event: fixtureEvent, now } =
    await import("./collection-test-fixture");
  const event = (overrides: Parameters<typeof fixtureEvent>[0]) =>
    fixtureEvent({ ...overrides, sourceId: "source", projectKey: "key" });
  await client.execute(
    "INSERT INTO analytics_excluded_paths(id,project_id,prefix) VALUES ('exclude-account','retention','/account')",
  );
  const excludedContext = crypto.randomUUID();
  for (const path of [
    "/account",
    "/account/billing",
    "/%61ccount/profile?token=secret",
  ]) {
    const result = await collect({
      events: [
        event({
          eventId: crypto.randomUUID(),
          contextId: excludedContext,
          name: "page_view",
          page: { host: "test.example", path },
        }),
      ],
      origin: "https://test.example",
      observedIp: "192.0.2.1",
      secrets: {},
      now,
    });
    expect(result.accepted).toBe(0);
  }
  expect(
    (
      await client.execute({
        sql: "SELECT id FROM analytics_contexts WHERE context_key = ?",
        args: [excludedContext],
      })
    ).rows,
  ).toHaveLength(0);
  const allowedContext = crypto.randomUUID();
  expect(
    (
      await collect({
        events: [
          event({
            eventId: crypto.randomUUID(),
            contextId: allowedContext,
            name: "page_view",
            page: { host: "test.example", path: "/accounting" },
          }),
        ],
        origin: "https://test.example",
        observedIp: null,
        secrets: {},
        now,
      })
    ).accepted,
  ).toBe(1);
  expect(
    (
      await client.execute({
        sql: "SELECT id FROM analytics_contexts WHERE context_key = ?",
        args: [allowedContext],
      })
    ).rows,
  ).toHaveLength(1);
});
