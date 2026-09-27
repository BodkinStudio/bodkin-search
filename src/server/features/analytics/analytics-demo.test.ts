/** Explicit opt-in local demo. Exercises collector/services; never runs in normal CI. */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { it, expect, vi } from "vitest";
import { writeFileSync } from "node:fs";
import type { JourneyEvent } from "@/types/schemas/analytics";
const databasePath = process.env.ANALYTICS_DEMO_DB;
it.skipIf(!databasePath)(
  "seed isolated test-environment journeys through the real collection pipeline",
  async () => {
    if (
      !databasePath?.includes("/.wrangler/state/") ||
      !databasePath.endsWith(".sqlite")
    )
      throw new Error("Use an explicit local Wrangler SQLite file");
    const client = createClient({ url: `file:${databasePath}` });
    await client.execute("PRAGMA foreign_keys=ON");
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
        if (statements.length) {
          // Same provider seam as production: every statement is a Drizzle query builder.
          await database.batch(
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            statements as unknown as Parameters<typeof database.batch>[0],
          );
        }
      },
    }));
    const { collect } = await import("./AnalyticsCollection");
    const { recordOutcome } = await import("./AnalyticsOutcomes");
    const { signIdentityAssertion } = await import("./crypto");
    const { createSource, saveSettings, deliverOutbox } =
      await import("./AnalyticsOperations");
    const projectId = "ea929114-c7de-4f0a-a829-199015ded001";
    const org = (
      await client.execute("select organization_id from projects limit 1")
    ).rows[0]?.organization_id;
    if (typeof org !== "string")
      throw new Error("Create a local workspace first");
    await client.execute({
      sql: "DELETE FROM projects WHERE id = ? AND name = 'DEMO — Journey Analytics'",
      args: [projectId],
    });
    await client.execute({
      sql: "INSERT INTO projects (id,organization_id,name,domain) VALUES (?,?,?,?)",
      args: [projectId, org, "DEMO — Journey Analytics", "journey-demo.test"],
    });
    await saveSettings({
      projectId,
      businessModel: "organisation",
      primaryOutcome: "registration_completed",
      matchingWindowHours: 24,
      retentionDays: 90,
      personalAccess: true,
      updatedAt: new Date().toISOString(),
    });
    const website = await createSource({
      projectId,
      hostname: "journey-demo.test",
      kind: "website",
      environment: "test",
    });
    const product = await createSource({
      projectId,
      hostname: "app.journey-demo.test",
      kind: "product",
      environment: "test",
    });
    const baseTime = Date.now() - 2 * 86400_000;
    let sequence = 0;
    const emit = async (
      contextId: string,
      name: JourneyEvent["name"],
      path: string,
      productSurface = false,
      network: string | { ip: string; assertion: string } = "192.0.2.11",
    ) => {
      const ip = typeof network === "string" ? network : network.ip;
      const assertion =
        typeof network === "string" ? undefined : network.assertion;
      const source = productSurface ? product : website;
      const now = new Date(baseTime + sequence++ * 60000);
      const event: JourneyEvent = {
        schemaVersion: 1,
        eventId: crypto.randomUUID(),
        projectKey: source.publicKey,
        sourceId: source.id,
        environment: "test",
        contextId,
        occurredAt: now.toISOString(),
        name,
        page: { host: source.hostname, path },
        consent: {
          analytics: true,
          attribution: true,
          identity: true,
          policyVersion: "synthetic-v1",
        },
        campaign: productSurface
          ? undefined
          : {
              source: "Google",
              medium: "organic",
              campaign: "Teams buyer guide",
            },
        properties:
          name === "acquisition_clicked"
            ? { action: "start_trial", destination: "product" }
            : undefined,
        identityAssertion: assertion,
      };
      await collect({
        events: [event],
        origin: `https://${source.hostname}`,
        observedIp: ip,
        secrets: {
          networkSecret: "synthetic-network-secret",
          identitySecret: "synthetic-identity-secret",
        },
        now,
      });
    };
    const finish = async (
      contextId: string,
      customerId: string,
      productSurface: boolean,
    ) => {
      const source = productSurface ? product : website;
      const assertion = await signIdentityAssertion(
        {
          projectId,
          sourceId: source.id,
          contextId,
          issuer: "synthetic",
          userId: `user-${customerId}`,
          organizationId: customerId,
          purpose: "identity",
          aud: "journey-analytics",
        },
        "synthetic-identity-secret",
      );
      await emit(contextId, "identity_known", "/onboarding", productSurface, {
        ip: "192.0.2.11",
        assertion,
      });
      await recordOutcome({
        projectId,
        sourceId: source.id,
        environment: "test",
        eventId: `registration-${customerId}`,
        issuer: "synthetic",
        customerId,
        contextId,
        name: "registration_completed",
        occurredAt: new Date(baseTime + sequence * 60000).toISOString(),
      });
    };
    const exact = crypto.randomUUID();
    for (const path of ["/", "/teams", "/pricing", "/teams", "/pricing"])
      await emit(exact, "page_view", path);
    await emit(exact, "acquisition_clicked", "/pricing");
    await finish(exact, "Northstar · synthetic", false);
    const anonymous = crypto.randomUUID();
    for (const path of ["/guides/teams-sms", "/teams", "/pricing"])
      await emit(anonymous, "page_view", path, false, "192.0.2.22");
    await emit(
      anonymous,
      "acquisition_clicked",
      "/pricing",
      false,
      "192.0.2.22",
    );
    const external = crypto.randomUUID();
    await emit(external, "product_opened", "/onboarding", true, "192.0.2.22");
    await finish(external, "Orbit · synthetic", true);
    const direct = crypto.randomUUID();
    await emit(direct, "product_opened", "/onboarding", true, "203.0.113.5");
    await finish(direct, "Cedar · synthetic", true);
    for (let i = 0; i < 8; i++) {
      const context = crypto.randomUUID();
      for (const path of i % 2
        ? ["/", "/teams", "/pricing"]
        : ["/guides/teams-sms", "/teams", "/contact"])
        await emit(context, "page_view", path, false, `198.51.100.${i + 1}`);
    }
    await recordOutcome({
      projectId,
      sourceId: website.id,
      environment: "test",
      eventId: "payment-demo",
      issuer: "synthetic",
      customerId: "Northstar · synthetic",
      contextId: exact,
      name: "payment_succeeded",
      occurredAt: new Date().toISOString(),
      amountMinor: 19900,
      currency: "USD",
      paymentId: "demo-payment-1",
    });
    await saveSettings({
      projectId,
      businessModel: "organisation",
      primaryOutcome: "registration_completed",
      matchingWindowHours: 24,
      retentionDays: 90,
      personalAccess: true,
      webhookUrl: "https://integration.journey-demo.test/events",
      updatedAt: new Date().toISOString(),
    });
    const deliveries: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        if (typeof init?.body !== "string")
          throw new Error("Expected JSON body");
        deliveries.push(JSON.parse(init.body));
        return new Response("accepted", { status: 200 });
      }),
    );
    await deliverOutbox("synthetic-delivery-secret", [
      "integration.journey-demo.test",
    ]);
    vi.unstubAllGlobals();
    expect(deliveries.length).toBe(3);
    const rows = await client.execute({
      sql: "SELECT method, count(*) as n FROM analytics_customers WHERE project_id=? GROUP BY method",
      args: [projectId],
    });
    expect(rows.rows.some((r) => r.method === "exact")).toBe(true);
    writeFileSync(
      ".bodkin/runs/2026-09-15-journey-analytics/demo.json",
      JSON.stringify(
        {
          projectId,
          website,
          product,
          url: `http://127.0.0.1:3115/p/${projectId}/analytics?environment=test`,
          attributions: rows.rows,
        },
        null,
        2,
      ),
    );
    client.close();
  },
);
