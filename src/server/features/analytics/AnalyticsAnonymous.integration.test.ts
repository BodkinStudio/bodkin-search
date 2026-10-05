import type * as CollectionModule from "./AnalyticsCollection";
import type * as OutcomesModule from "./AnalyticsOutcomes";
import * as schema from "@/db/analytics.schema";
import type { JourneyEvent } from "@/types/schemas/analytics";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { now, ids, event } from "./collection-test-fixture";
import { signIdentityAssertion } from "./crypto";

let client: Client;
let db: LibSQLDatabase;
let collect: typeof CollectionModule.collect;
let recordOutcome: typeof OutcomesModule.recordOutcome;

beforeAll(async () => {
  // Keep day keys and signed assertions on the fixture's clock.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  client = createClient({ url: "file::memory:" });
  db = drizzle(client);
  vi.doMock("@/db", () => ({ db }));
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
INSERT INTO analytics_settings(project_id,updated_at) VALUES ('p','2026-09-01');
INSERT INTO analytics_sources VALUES ('${ids.website}','p','00000000-0000-4000-8000-000000000001','website','site.test','production','product',1,'2026-09-01T00:00:00.000Z');
INSERT INTO analytics_actions VALUES ('a','p','start_trial','product');`,
  );
  ({ collect } = await import("./AnalyticsCollection"));
  ({ recordOutcome } = await import("./AnalyticsOutcomes"));
});
afterAll(() => {
  client.close();
  vi.useRealTimers();
});

const click = { action: "start_trial", destination: "product" };
/** A storage-free event; the policy version tags the contexts a test creates. */
const anonymous = (tag: string, overrides: Partial<JourneyEvent> = {}) =>
  event({
    mode: "anonymous",
    contextId: undefined,
    eventId: crypto.randomUUID(),
    name: "page_view",
    properties: undefined,
    consent: {
      analytics: false,
      attribution: false,
      identity: false,
      policyVersion: tag,
    },
    ...overrides,
  });
const send = (
  events: JourneyEvent[],
  visitor: { ip?: string | null; userAgent?: string; at?: Date } = {},
) =>
  collect({
    events,
    origin: "https://site.test",
    observedIp: visitor.ip === undefined ? "203.0.113.50" : visitor.ip,
    userAgent: visitor.userAgent ?? "Browser/1",
    secrets: { networkSecret: "network", identitySecret: "identity" },
    now: visitor.at ?? now,
  });
const contextsTagged = async (tag: string) =>
  db
    .select()
    .from(schema.analyticsContexts)
    .where(eq(schema.analyticsContexts.policyVersion, `li:${tag}`));

describe("anonymous (storage-free) collection", () => {
  it("drops anonymous events unless the project opts in and the edge supplies an IP", async () => {
    const dropped = { accepted: 0, duplicates: 0 };
    expect(await send([anonymous("off")])).toEqual(dropped);
    await client.execute(
      "UPDATE analytics_settings SET anonymous_collection = 1",
    );
    expect(await send([anonymous("off")], { ip: null })).toEqual(dropped);
  });

  it("keys a visitor per day from IP and browser and never stores the IP", async () => {
    expect(
      await send([
        anonymous("day"),
        anonymous("day", { name: "acquisition_clicked", properties: click }),
      ]),
    ).toEqual({ accepted: 2, duplicates: 0 });
    await send([anonymous("day")]);
    await send([anonymous("day")], { userAgent: "Browser/2" });
    await send([anonymous("day")], { at: new Date(now.getTime() + 86400_000) });
    const contexts = await contextsTagged("day");
    expect(contexts).toHaveLength(3);
    expect(contexts.every((c) => c.contextKey.startsWith("anon:"))).toBe(true);
    const events = await db
      .select()
      .from(schema.analyticsEvents)
      .where(eq(schema.analyticsEvents.contextId, contexts[0].id));
    expect(events).toHaveLength(3);
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    for (const { name } of tables.rows) {
      if (typeof name !== "string") continue;
      const rows = await client.execute(`SELECT * FROM "${name}"`);
      expect(JSON.stringify(rows.rows)).not.toContain("203.0.113.50");
    }
  });

  it("binds an anonymous identity and attributes an outcome sent without a context", async () => {
    const visitor = { ip: "203.0.113.60" };
    await send(
      [
        anonymous("identity", {
          name: "acquisition_clicked",
          properties: click,
        }),
      ],
      visitor,
    );
    const assertion = await signIdentityAssertion(
      {
        projectId: "p",
        sourceId: ids.website,
        contextId: "anonymous",
        issuer: "issuer",
        userId: "user",
        organizationId: "org",
        purpose: "identity",
        aud: "journey-analytics",
      },
      "identity",
    );
    await send(
      [
        anonymous("identity", {
          name: "identity_known",
          identityAssertion: assertion,
        }),
      ],
      visitor,
    );
    await recordOutcome({
      projectId: "p",
      sourceId: ids.website,
      environment: "production",
      eventId: "outcome",
      issuer: "issuer",
      customerId: "org",
      name: "registration_completed",
      occurredAt: now.toISOString(),
    });
    const [context] = await contextsTagged("identity");
    const [customer] = await db.select().from(schema.analyticsCustomers);
    expect(customer).toMatchObject({
      method: "exact",
      reason: "verified_context",
      contextId: context.id,
    });
    expect(context.customerId).toBe(customer.id);
  });

  it("re-keys the day's anonymous context when the visitor consents", async () => {
    const visitor = { ip: "203.0.113.70" };
    await send([anonymous("adopt")], visitor);
    const contextId = crypto.randomUUID();
    await send(
      [
        event({
          eventId: crypto.randomUUID(),
          contextId,
          name: "page_view",
          properties: undefined,
        }),
      ],
      visitor,
    );
    const contexts = await db
      .select()
      .from(schema.analyticsContexts)
      .where(eq(schema.analyticsContexts.contextKey, contextId));
    expect(contexts).toHaveLength(1);
    expect(await contextsTagged("adopt")).toHaveLength(0);
    const events = await db
      .select()
      .from(schema.analyticsEvents)
      .where(eq(schema.analyticsEvents.contextId, contexts[0].id));
    expect(events.map((e) => e.policyVersion).toSorted()).toEqual([
      "li:adopt",
      "v1",
    ]);
  });
});
