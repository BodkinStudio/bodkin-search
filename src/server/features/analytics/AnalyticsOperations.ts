import { configurationAuditRows } from "./AnalyticsReportingConfiguration";
import { analyticsAudit } from "@/db/schema";
import { and, eq, isNull, count } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  analyticsSources,
  analyticsSettings,
  analyticsActions,
  analyticsEvents,
  analyticsOutbox,
} from "@/db/schema";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
export async function listSources(projectId: string) {
  return db
    .select()
    .from(analyticsSources)
    .where(eq(analyticsSources.projectId, projectId));
}
export async function createSource(
  input: {
    projectId: string;
    hostname: string;
    kind: string;
    environment: string;
    destination?: string;
  },
  actorId = "system",
) {
  const row = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    hostname: input.hostname.toLowerCase(),
    kind: input.kind,
    environment: input.environment,
    destination: input.destination ?? "product",
    publicKey: crypto.randomUUID(),
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  await runBatch((tx) => [
    tx.insert(analyticsSources).values(row),
    tx.insert(analyticsAudit).values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      actorId,
      entity: `source:${row.id}`,
      field: "registered",
      previousValue: null,
      nextValue: `${row.hostname} (${row.environment}, ${row.kind})`,
      reason: null,
      occurredAt: row.createdAt,
    }),
    tx
      .insert(analyticsActions)
      .values({
        id: crypto.randomUUID(),
        projectId: input.projectId,
        action: "start_trial",
        destination: row.destination,
      })
      .onConflictDoNothing(),
  ]);
  return row;
}
export async function saveSettings(
  input: typeof analyticsSettings.$inferInsert,
  actorId = "system",
) {
  const previous = await repo.settings(input.projectId);
  const audit = configurationAuditRows(
    input.projectId,
    actorId,
    "tracking-settings",
    previous,
    input,
  );
  await runBatch((tx) => [
    tx
      .insert(analyticsSettings)
      .values(input)
      .onConflictDoUpdate({ target: analyticsSettings.projectId, set: input }),
    ...(audit.length ? [tx.insert(analyticsAudit).values(audit)] : []),
  ]);
  return repo.settings(input.projectId);
}
export async function health(projectId: string) {
  const sources = await listSources(projectId);
  const [events] = await db
    .select({ total: count() })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.projectId, projectId));
  const pending = await db
    .select()
    .from(analyticsOutbox)
    .where(
      and(
        eq(analyticsOutbox.projectId, projectId),
        isNull(analyticsOutbox.deliveredAt),
      ),
    );
  return {
    sources: sources.length,
    acceptedEvents: events?.total ?? 0,
    pendingDeliveries: pending.length,
    failedDeliveries: pending.filter((x) => x.attempts > 0).length,
    deliveryStatus: pending.map((x) => ({
      id: x.id,
      attempts: x.attempts,
      lastError: x.lastError,
      nextAttemptAt: x.nextAttemptAt,
    })),
    coverage:
      "The collector cannot count completely unobserved or non-consenting visitors.",
  };
}
export { purgeExpired } from "./AnalyticsRetention";
export { eraseCustomerRecords as eraseCustomer } from "./AnalyticsErasure";
export { deliverOutbox } from "./AnalyticsDelivery";
