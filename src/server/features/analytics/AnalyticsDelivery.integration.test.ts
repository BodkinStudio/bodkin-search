import type * as Delivery from "./AnalyticsDelivery";
import type * as Outcomes from "./AnalyticsOutcomes";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
function requiredString(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("Expected string fixture value");
  return value;
}
let client: Client;
let deliverOutbox: typeof Delivery.deliverOutbox;
let recordOutcome: typeof Outcomes.recordOutcome;
beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const database = drizzle(client);
  vi.doMock("@/db", () => ({ db: database }));
  vi.doMock("@/db/schema", async () => ({
    ...(await import("@/db/analytics.schema")),
    ...(await import("@/db/analytics-reporting.schema")),
  }));
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (
      build: (tx: typeof database) => readonly Promise<unknown>[],
    ) => {
      const statements = build(database);
      if (statements.length)
        await database.batch(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- real SQLite builders at production database seam
          statements as unknown as Parameters<typeof database.batch>[0],
        );
    },
  }));
  await client.executeMultiple(
    "CREATE TABLE projects (id text primary key);" +
      ["0073_aspiring_inertia", "0074_right_mephisto", "0075_panoramic_namora"]
        .map((name) => readFileSync(`drizzle/${name}.sql`, "utf8"))
        .join("\n"),
  );
  await client.executeMultiple(`INSERT INTO projects VALUES ('delivery');
    INSERT INTO analytics_settings(project_id,primary_outcome,personal_access,webhook_url,updated_at) VALUES ('delivery','registration_completed',1,'https://hooks.example.test/events','2026-09-15');
    INSERT INTO analytics_sources(id,project_id,public_key,kind,hostname,created_at) VALUES ('source','delivery','public-key','server','server.example.test','2026-09-01');
    INSERT INTO analytics_customers(id,project_id,environment,issuer,external_id,first_seen_at,decision_version) VALUES ('legacy','delivery','production','issuer','legacy-key','2026-01-01',4);
    INSERT INTO analytics_outbox(id,project_id,customer_id,version,created_at,next_attempt_at,delivered_at) VALUES ('legacy-delivery','delivery','legacy',4,'2026-01-01','2026-01-01','2026-01-01');`);
  await client.executeMultiple(
    readFileSync("drizzle/0076_dazzling_wolf_cub.sql", "utf8") +
      readFileSync("drizzle/0079_wandering_zarda.sql", "utf8") +
      readFileSync("drizzle/0082_milky_wolfpack.sql", "utf8") +
      readFileSync("drizzle/0083_crazy_newton_destine.sql", "utf8"),
  );
  ({ deliverOutbox } = await import("./AnalyticsDelivery"));
  ({ recordOutcome } = await import("./AnalyticsOutcomes"));
});
afterAll(() => {
  vi.unstubAllGlobals();
  client.close();
});
it("backfills independent delivery sequence from existing decision versions", async () => {
  expect(
    (
      await client.execute(
        "SELECT delivery_version FROM analytics_customers WHERE id='legacy'",
      )
    ).rows[0]?.delivery_version,
  ).toBe(4);
  expect(
    (
      await client.execute(
        "SELECT decision_version FROM analytics_outbox WHERE id='legacy-delivery'",
      )
    ).rows[0]?.decision_version,
  ).toBe(4);
});
it("delivers immutable lifecycle events before acquisition and retries identical bodies with increasing delivery versions", async () => {
  const base = {
    projectId: "delivery",
    sourceId: "source",
    environment: "production" as const,
    issuer: "issuer",
    customerId: "customer",
    occurredAt: "2026-09-01T00:00:00Z",
  };
  await recordOutcome({
    ...base,
    eventId: "enquiry",
    name: "enquiry_submitted",
  });
  await recordOutcome({
    ...base,
    eventId: "registration",
    name: "registration_completed",
  });
  await recordOutcome({
    ...base,
    eventId: "activation",
    name: "activation_achieved",
  });
  const queued = await client.execute(
    "SELECT version,decision_version,kind FROM analytics_outbox WHERE customer_id != 'legacy' ORDER BY version",
  );
  expect(queued.rows).toEqual([
    { version: 1, decision_version: 0, kind: "lifecycle" },
    { version: 2, decision_version: 1, kind: "acquisition" },
    { version: 3, decision_version: 1, kind: "lifecycle" },
  ]);
  const send = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response("retry", { status: 503 }),
  );
  vi.stubGlobal("fetch", send);
  await deliverOutbox("root-secret", ["hooks.example.test"]);
  const original = send.mock.calls.map((call) => requiredString(call[1].body));
  expect(original).toHaveLength(3);
  expect(JSON.parse(original[0])).toMatchObject({
    deliveryVersion: 1,
    decisionVersion: 0,
    lifecycle: "enquiry_submitted",
    attribution: null,
    acquiredAt: null,
    outcome: { eventId: "enquiry", name: "enquiry_submitted" },
  });
  expect(JSON.parse(original[1])).toMatchObject({
    deliveryVersion: 2,
    decisionVersion: 1,
    lifecycle: "registration_completed",
  });
  const { verifyBackendRequest, deriveProjectSecret } =
    await import("./crypto");
  const headers = new Headers(send.mock.calls[0][1].headers);
  expect(
    await verifyBackendRequest(
      await deriveProjectSecret("root-secret", "delivery", "outbox"),
      headers.get("x-bodkin-timestamp")!,
      original[0],
      headers.get("x-bodkin-signature")!,
    ),
  ).toBe(true);
  await client.execute(
    "UPDATE analytics_outbox SET next_attempt_at = '2020-01-01' WHERE delivered_at IS NULL",
  );
  send.mockImplementation(async () => new Response("ok"));
  await deliverOutbox("root-secret", ["hooks.example.test"]);
  expect(
    send.mock.calls.slice(3).map((call) => requiredString(call[1].body)),
  ).toEqual(original);
  expect(
    (
      await client.execute(
        "SELECT attempts FROM analytics_outbox WHERE customer_id != 'legacy'",
      )
    ).rows.every((r) => r.attempts === 2),
  ).toBe(true);
  await deliverOutbox("root-secret", ["hooks.example.test"]);
  expect(send).toHaveBeenCalledTimes(6);
});
it("delivers retained manual correction touch snapshots and rejects stale corrections", async () => {
  const row = (
    await client.execute(
      "SELECT id FROM analytics_customers WHERE external_id='customer'",
    )
  ).rows[0];
  const customerId = requiredString(row.id);
  await client.executeMultiple(
    `INSERT INTO analytics_events(id,project_id,source_id,environment,context_id,event_id,session_id,name,occurred_at,received_at,page_host,page_path,campaign_source,action,destination,policy_version) VALUES ('click','delivery','source','production','browser','click-key','session','acquisition_clicked','2026-08-01','2026-08-01','site.example.test','/pricing','newsletter','start_trial','product','1');`,
  );
  const { correctAttribution } = await import("./AnalyticsCorrection");
  const input = {
    projectId: "delivery",
    customerId,
    expectedVersion: 1,
    clickEventId: "click",
    reason: "Verified campaign",
    actorId: "maintainer",
  };
  expect(await correctAttribution(input)).toEqual({ version: 2 });
  await expect(correctAttribution(input)).rejects.toThrow("decision changed");
  await client.execute("DELETE FROM analytics_events WHERE id='click'");
  const send = vi.fn(
    async (_url: string, _init: RequestInit) => new Response("ok"),
  );
  vi.stubGlobal("fetch", send);
  await deliverOutbox("root-secret", ["hooks.example.test"]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(JSON.parse(requiredString(send.mock.calls[0][1].body))).toMatchObject({
    deliveryVersion: 4,
    decisionVersion: 2,
    kind: "correction",
    lifecycle: null,
    outcome: null,
    attribution: {
      method: "manual",
      acquisitionTouch: {
        sourceHost: "site.example.test",
        pagePath: "/pricing",
        campaignSource: "newsletter",
      },
    },
  });
  expect(
    (
      await client.execute(
        "SELECT * FROM analytics_audit WHERE entity LIKE 'customer:%'",
      )
    ).rows,
  ).toHaveLength(1);
});

it("erases correction audit and queued downstream processing with the customer", async () => {
  const row = (
    await client.execute(
      "SELECT id FROM analytics_customers WHERE external_id='customer'",
    )
  ).rows[0];
  const customerId = requiredString(row.id);
  const { eraseCustomerRecords } = await import("./AnalyticsErasure");
  await eraseCustomerRecords("delivery", customerId, {
    secret: "test-erasure-secret",
  });
  expect(
    (
      await client.execute({
        sql: "SELECT * FROM analytics_audit WHERE entity=?",
        args: [`customer:${customerId}`],
      })
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await client.execute({
        sql: "SELECT * FROM analytics_outbox WHERE customer_id=?",
        args: [customerId],
      })
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await client.execute({
        sql: "SELECT * FROM analytics_attributions WHERE customer_id=?",
        args: [customerId],
      })
    ).rows,
  ).toHaveLength(0);
});

it("removes orphan dependent rows when concurrent erasure already removed the customer", async () => {
  await client.executeMultiple(`INSERT INTO analytics_attributions(id,project_id,customer_id,version,method,reason,created_at) VALUES ('orphan-decision','delivery','missing-customer',1,'manual','private reason','2026-09-15');
    INSERT INTO analytics_audit(id,project_id,actor_id,entity,field,reason,occurred_at) VALUES ('orphan-audit','delivery','actor','customer:missing-customer','attribution','private reason','2026-09-15');
    INSERT INTO analytics_claims(click_event_id,customer_id,project_id) VALUES ('orphan-click','missing-customer','delivery');`);
  const { eraseCustomerRecords } = await import("./AnalyticsErasure");
  await eraseCustomerRecords("delivery", "missing-customer", {
    suppressReplay: false,
  });
  expect(
    (
      await client.execute(
        "SELECT * FROM analytics_attributions WHERE id='orphan-decision'",
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await client.execute(
        "SELECT * FROM analytics_audit WHERE id='orphan-audit'",
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await client.execute(
        "SELECT * FROM analytics_claims WHERE click_event_id='orphan-click'",
      )
    ).rows,
  ).toHaveLength(0);
});
