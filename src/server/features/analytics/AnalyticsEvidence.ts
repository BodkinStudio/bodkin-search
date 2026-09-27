import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsAttributions,
  analyticsCustomers,
  analyticsEvents,
  analyticsOutbox,
} from "@/db/schema";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
export async function customerEvidence(
  projectId: string,
  customerId: string,
  environment?: "production" | "test",
) {
  const config = await repo.settings(projectId);
  if (!config.personalAccess)
    throw new Error("Individual inspection is disabled");
  const [customer] = await db
    .select()
    .from(analyticsCustomers)
    .where(
      and(
        eq(analyticsCustomers.projectId, projectId),
        eq(analyticsCustomers.id, customerId),
      ),
    )
    .limit(1);
  if (!customer || (environment && customer.environment !== environment))
    throw new Error("Customer not found");
  const decisions = await db
    .select()
    .from(analyticsAttributions)
    .where(
      and(
        eq(analyticsAttributions.projectId, projectId),
        eq(analyticsAttributions.customerId, customerId),
      ),
    );
  const click = customer.clickEventId
    ? (
        await db
          .select({
            contextId: analyticsEvents.contextId,
            pagePath: analyticsEvents.pagePath,
            campaign: analyticsEvents.campaignName,
            source: analyticsEvents.campaignSource,
            receivedAt: analyticsEvents.receivedAt,
          })
          .from(analyticsEvents)
          .where(
            and(
              eq(analyticsEvents.projectId, projectId),
              eq(analyticsEvents.id, customer.clickEventId),
            ),
          )
          .limit(1)
      )[0]
    : null;
  const deliveries = await db
    .select({
      version: analyticsOutbox.version,
      deliveredAt: analyticsOutbox.deliveredAt,
      attempts: analyticsOutbox.attempts,
      lastError: analyticsOutbox.lastError,
    })
    .from(analyticsOutbox)
    .where(
      and(
        eq(analyticsOutbox.projectId, projectId),
        eq(analyticsOutbox.customerId, customerId),
      ),
    );
  return {
    customerLabel: customer.externalId,
    environment: customer.environment,
    decisionVersion: customer.decisionVersion,
    clickEventId: customer.clickEventId,
    method: customer.method,
    reason: customer.reason,
    contextId: customer.contextId,
    click: click ?? null,
    decisions: decisions.map((d) => ({
      version: d.version,
      method: d.method,
      reason: d.reason,
      elapsedMs: d.elapsedMs,
      candidateGroupCount: d.candidateGroupCount,
      createdAt: d.createdAt,
      ruleVersion: d.ruleVersion,
    })),
    deliveries,
  };
}
