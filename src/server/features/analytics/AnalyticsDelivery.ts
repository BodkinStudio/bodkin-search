import { and, eq, isNull, lte, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsOutbox,
  analyticsCustomers,
  analyticsAttributions,
  analyticsOutcomes,
} from "@/db/schema";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
import { deriveProjectSecret, signBackendRequest } from "./crypto";

function safeDestination(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hostname === "localhost" ||
    /^\d+\./.test(url.hostname) ||
    url.hostname.includes(":") ||
    !url.hostname.includes(".") ||
    url.hostname.endsWith(".local")
  )
    throw new Error("Use a public HTTPS webhook hostname");
  return url.toString();
}
async function deliveryBody(row: typeof analyticsOutbox.$inferSelect) {
  const [customer] = await db
    .select()
    .from(analyticsCustomers)
    .where(
      and(
        eq(analyticsCustomers.projectId, row.projectId),
        eq(analyticsCustomers.id, row.customerId),
      ),
    )
    .limit(1);
  if (!customer) throw new Error("Customer snapshot unavailable");
  const [decision] =
    row.decisionVersion > 0
      ? await db
          .select()
          .from(analyticsAttributions)
          .where(
            and(
              eq(analyticsAttributions.projectId, row.projectId),
              eq(analyticsAttributions.customerId, row.customerId),
              eq(analyticsAttributions.version, row.decisionVersion),
            ),
          )
          .limit(1)
      : [];
  if (row.decisionVersion > 0 && !decision)
    throw new Error("Acquisition snapshot unavailable");
  const [outcome] = row.outcomeId
    ? await db
        .select()
        .from(analyticsOutcomes)
        .where(
          and(
            eq(analyticsOutcomes.projectId, row.projectId),
            eq(analyticsOutcomes.customerId, row.customerId),
            eq(analyticsOutcomes.id, row.outcomeId),
          ),
        )
        .limit(1)
    : [];
  if (row.outcomeId && !outcome)
    throw new Error("Outcome snapshot unavailable");
  return JSON.stringify({
    idempotencyKey: `${row.customerId}:${row.version}`,
    projectId: row.projectId,
    environment: customer.environment,
    customer: { issuer: customer.issuer, id: customer.externalId },
    deliveryVersion: row.version,
    decisionVersion: row.decisionVersion,
    kind: row.kind,
    acquiredAt: decision ? customer.acquiredAt : null,
    method: decision?.method ?? "unattributed",
    reason: decision?.reason ?? "client_observation_missing",
    // The originating event is immutable; never substitute a later customer state on retry.
    lifecycle: outcome?.name ?? null,
    outcome: outcome
      ? {
          eventId: outcome.externalId,
          name: outcome.name,
          occurredAt: outcome.occurredAt,
          amountMinor: outcome.amountMinor,
          currency: outcome.currency,
          paymentId: outcome.paymentId,
        }
      : null,
    attribution: decision
      ? {
          method: decision.method,
          reason: decision.reason,
          ruleVersion: decision.ruleVersion,
          firstTouch: {
            observedAt: decision.firstTouchAt,
            pagePath: decision.firstPagePath,
            source: decision.firstSource,
          },
          acquisitionTouch: {
            sourceHost: decision.sourceHost,
            pagePath: decision.pagePath,
            referrerHost: decision.referrerHost,
            campaignSource: decision.campaignSource,
            campaignMedium: decision.campaignMedium,
            campaignName: decision.campaignName,
            action: decision.action,
            destination: decision.destination,
          },
        }
      : null,
  });
}
export async function deliverOutbox(
  secret: string | undefined,
  allowedHosts: string[] = [],
) {
  if (!secret) return;
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(analyticsOutbox)
    .where(
      and(
        isNull(analyticsOutbox.deliveredAt),
        lte(analyticsOutbox.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(analyticsOutbox.createdAt), asc(analyticsOutbox.version))
    .limit(50);
  for (const row of rows) {
    const config = await repo.settings(row.projectId);
    if (!config.webhookUrl) continue;
    try {
      const destination = safeDestination(config.webhookUrl);
      if (!allowedHosts.includes(new URL(destination).hostname))
        throw new Error("Webhook hostname is not allowed");
      const body = await deliveryBody(row);
      const timestamp = String(Date.now());
      const response = await fetch(destination, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bodkin-timestamp": timestamp,
          "x-bodkin-signature": await signBackendRequest(
            await deriveProjectSecret(secret, row.projectId, "outbox"),
            timestamp,
            body,
          ),
          "idempotency-key": `${row.customerId}:${row.version}`,
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await db
        .update(analyticsOutbox)
        .set({ deliveredAt: now, attempts: row.attempts + 1, lastError: null })
        .where(eq(analyticsOutbox.id, row.id));
    } catch {
      await db
        .update(analyticsOutbox)
        .set({
          attempts: row.attempts + 1,
          lastError:
            "Delivery failed; verify endpoint, allowed hostname, and retained event/decision snapshots",
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(86400_000, 60_000 * 2 ** Math.min(row.attempts, 10)),
          ).toISOString(),
        })
        .where(eq(analyticsOutbox.id, row.id));
    }
  }
}
