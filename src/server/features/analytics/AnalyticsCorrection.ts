import {
  assertIdentityNotErased,
  enforceErasureAfterWrite,
} from "./AnalyticsErasure";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  analyticsCustomers,
  analyticsEvents,
  analyticsAttributions,
  analyticsClaims,
  analyticsOutbox,
  analyticsAudit,
} from "@/db/schema";
import { touchEvidence } from "./AnalyticsTouchEvidence";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";

/** A human attribution decision never establishes verified personal identity. */
export async function correctAttribution(input: {
  projectId: string;
  customerId: string;
  expectedVersion: number;
  clickEventId: string | null;
  reason: string;
  actorId: string;
}) {
  if (!(await repo.settings(input.projectId)).personalAccess)
    throw new Error("Individual inspection is disabled");
  const [customer] = await db
    .select()
    .from(analyticsCustomers)
    .where(
      and(
        eq(analyticsCustomers.projectId, input.projectId),
        eq(analyticsCustomers.id, input.customerId),
      ),
    )
    .limit(1);
  if (!customer?.acquiredAt)
    throw new Error("Only acquired customers can be corrected");
  await assertIdentityNotErased(customer);
  if (customer.decisionVersion !== input.expectedVersion)
    throw new Error(
      "This decision changed. Reload the evidence before correcting it.",
    );
  if (input.clickEventId) {
    const [click] = await db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.id, input.clickEventId),
          eq(analyticsEvents.projectId, input.projectId),
          eq(analyticsEvents.environment, customer.environment),
          eq(analyticsEvents.name, "acquisition_clicked"),
        ),
      )
      .limit(1);
    if (!click || click.receivedAt > customer.acquiredAt)
      throw new Error(
        "Choose a retained acquisition click from this environment before acquisition",
      );
    const [claim] = await db
      .select()
      .from(analyticsClaims)
      .where(eq(analyticsClaims.clickEventId, click.id))
      .limit(1);
    if (claim && claim.customerId !== customer.id)
      throw new Error("This click is already attributed to another customer");
  }
  const touch = await touchEvidence(input.projectId, input.clickEventId);
  const version = input.expectedVersion + 1;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const method = input.clickEventId ? "manual" : "unattributed";
  // The unique attribution version is the optimistic concurrency guard: a competing
  // writer makes this atomic batch roll back, including the customer update.
  await runBatch((tx) => [
    tx.insert(analyticsAttributions).values({
      id,
      projectId: input.projectId,
      customerId: customer.id,
      version,
      clickEventId: input.clickEventId,
      method,
      reason: `manual: ${input.reason}`,
      candidateGroupCount: 0,
      elapsedMs: null,
      ruleVersion: 1,
      createdAt: now,
      ...touch,
    }),
    tx
      .update(analyticsCustomers)
      .set({
        method,
        reason: `manual: ${input.reason}`,
        clickEventId: input.clickEventId,
        decisionVersion: version,
        deliveryVersion: sql`${analyticsCustomers.deliveryVersion}+1`,
      })
      .where(
        and(
          eq(analyticsCustomers.id, customer.id),
          eq(analyticsCustomers.decisionVersion, input.expectedVersion),
        ),
      ),
    tx
      .delete(analyticsClaims)
      .where(
        and(
          eq(analyticsClaims.projectId, input.projectId),
          eq(analyticsClaims.customerId, customer.id),
        ),
      ),
    ...(input.clickEventId
      ? [
          tx.insert(analyticsClaims).values({
            projectId: input.projectId,
            customerId: customer.id,
            clickEventId: input.clickEventId,
          }),
        ]
      : []),
    tx.insert(analyticsAudit).values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      actorId: input.actorId,
      entity: `customer:${customer.id}`,
      field: "attribution",
      previousValue: `${customer.method}:${customer.clickEventId ?? "none"}`,
      nextValue: `${method}:${input.clickEventId ?? "none"}`,
      reason: input.reason,
      occurredAt: now,
    }),
    tx.insert(analyticsOutbox).select(
      tx
        .select({
          id: sql<string>`${crypto.randomUUID()}`.as("id"),
          projectId: analyticsCustomers.projectId,
          customerId: analyticsCustomers.id,
          version: analyticsCustomers.deliveryVersion,
          decisionVersion: analyticsCustomers.decisionVersion,
          kind: sql<string>`'correction'`.as("kind"),
          outcomeId: sql<null>`null`.as("outcomeId"),
          createdAt: sql<string>`${now}`.as("createdAt"),
          deliveredAt: sql<null>`null`.as("deliveredAt"),
          attempts: sql<number>`0`.as("attempts"),
          nextAttemptAt: sql<string>`${now}`.as("nextAttemptAt"),
          lastError: sql<null>`null`.as("lastError"),
        })
        .from(analyticsCustomers)
        .where(eq(analyticsCustomers.id, customer.id)),
    ),
  ]);
  await enforceErasureAfterWrite(customer, customer.id);
  return { version };
}
