import { touchEvidence } from "./AnalyticsTouchEvidence";
import {
  assertIdentityNotErased,
  enforceErasureAfterWrite,
} from "./AnalyticsErasure";
import { acquisitionEvidence } from "./AnalyticsAcquisitionEvidence";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  analyticsAttributions,
  analyticsClaims,
  analyticsCustomers,
  analyticsOutbox,
  analyticsOutcomes,
  analyticsEvents,
} from "@/db/schema";
import type { ServerJourneyEvent } from "@/types/schemas/analytics";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
import { outcomeRow } from "./outcome-row";

export async function recordOutcome(event: ServerJourneyEvent) {
  await validateOutcomeSource(event);
  await assertIdentityNotErased({
    projectId: event.projectId,
    environment: event.environment,
    issuer: event.issuer,
    externalId: event.customerId,
  });
  const now = new Date().toISOString();
  // A backend webhook address is never an acquisition observation.
  const context = event.contextId
    ? await repo.context(event.projectId, event.sourceId, event.contextId)
    : undefined;
  if (context && (!context.identityAllowed || !context.userId))
    throw new Error(
      "Context must have verified identity before an outcome binds it",
    );
  const customerKey = and(
    eq(analyticsCustomers.projectId, event.projectId),
    eq(analyticsCustomers.environment, event.environment),
    eq(analyticsCustomers.issuer, event.issuer),
    eq(analyticsCustomers.externalId, event.customerId),
  );
  await db
    .insert(analyticsCustomers)
    .values({
      id: crypto.randomUUID(),
      projectId: event.projectId,
      environment: event.environment,
      issuer: event.issuer,
      externalId: event.customerId,
      firstSeenAt: now,
    })
    .onConflictDoNothing();
  const [customer] = await db
    .select()
    .from(analyticsCustomers)
    .where(customerKey)
    .limit(1);
  if (!customer) throw new Error("Customer unavailable");
  if (context && context.customerId !== customer.id)
    throw new Error("Outcome customer does not match verified context");
  const [duplicate] = await db
    .select({ id: analyticsOutcomes.id })
    .from(analyticsOutcomes)
    .where(
      and(
        eq(analyticsOutcomes.projectId, event.projectId),
        eq(analyticsOutcomes.environment, event.environment),
        eq(analyticsOutcomes.issuer, event.issuer),
        eq(analyticsOutcomes.externalId, event.eventId),
      ),
    )
    .limit(1);
  if (duplicate) return { duplicate: true, customerId: customer.id };
  if (event.name === "payment_succeeded" && event.paymentId) {
    const [payment] = await db
      .select()
      .from(analyticsOutcomes)
      .where(
        and(
          eq(analyticsOutcomes.projectId, event.projectId),
          eq(analyticsOutcomes.environment, event.environment),
          eq(analyticsOutcomes.issuer, event.issuer),
          eq(analyticsOutcomes.paymentId, event.paymentId),
          eq(analyticsOutcomes.name, "payment_succeeded"),
        ),
      )
      .limit(1);
    if (payment) return { duplicate: true, customerId: customer.id };
  }
  await validateRefund(event, customer.id);
  const config = await repo.settings(event.projectId);
  const qualifies =
    event.name === config.primaryOutcome ||
    event.name === "customer_acquired" ||
    event.name === "payment_succeeded";
  // Anonymous pages cannot send their server-derived key, so an outcome
  // without one uses the customer's latest attributable context.
  const journey =
    context ??
    (event.contextId ? undefined : await repo.latestJourney(customer));
  let evidence = await acquisitionEvidence(journey, customer);
  if (evidence.clickEventId) {
    const [claim] = await db
      .select()
      .from(analyticsClaims)
      .where(eq(analyticsClaims.clickEventId, evidence.clickEventId))
      .limit(1);
    if (claim && claim.customerId !== customer.id)
      evidence = {
        method: "unattributed",
        reason: "existing_customer",
        clickEventId: null,
        candidateGroupCount: 0,
        elapsedMs: null,
      };
  }
  const correcting =
    customer.acquiredAt &&
    customer.method === "ip_time" &&
    evidence.method === "exact";
  const decide = (qualifies && !customer.acquiredAt) || correcting;
  const version = customer.decisionVersion + 1;
  const touch = await touchEvidence(event.projectId, evidence.clickEventId);
  const lifecycle = lifecycleFor(event.name);
  const outcome = outcomeRow(event, customer.id, journey?.id ?? null);
  await runBatch((tx) => [
    tx.insert(analyticsOutcomes).values(outcome),
    tx
      .update(analyticsCustomers)
      .set({
        lifecycle,
        deliveryVersion: sql`${analyticsCustomers.deliveryVersion}+1`,
      })
      .where(eq(analyticsCustomers.id, customer.id)),
    ...(event.name === "refund_issued"
      ? [
          tx
            .update(analyticsOutcomes)
            .set({
              refundedMinor: sql`${analyticsOutcomes.refundedMinor} + ${event.amountMinor}`,
            })
            .where(
              and(
                eq(analyticsOutcomes.projectId, event.projectId),
                eq(analyticsOutcomes.environment, event.environment),
                eq(analyticsOutcomes.issuer, event.issuer),
                eq(analyticsOutcomes.paymentId, event.paymentId!),
                eq(analyticsOutcomes.name, "payment_succeeded"),
              ),
            ),
        ]
      : []),
    ...(decide
      ? [
          tx
            .update(analyticsCustomers)
            .set({
              acquiredAt: customer.acquiredAt ?? event.occurredAt,
              method: evidence.method,
              clickEventId: evidence.clickEventId,
              contextId: journey?.id ?? null,
              reason: evidence.reason,
              decisionVersion: version,
            })
            .where(
              and(
                eq(analyticsCustomers.id, customer.id),
                eq(
                  analyticsCustomers.decisionVersion,
                  customer.decisionVersion,
                ),
              ),
            ),
        ]
      : []),
    ...(decide
      ? [
          tx
            .insert(analyticsAttributions)
            .select(
              tx
                .select({
                  id: sql<string>`${crypto.randomUUID()}`.as("id"),
                  projectId: sql<string>`${event.projectId}`.as("projectId"),
                  customerId: analyticsCustomers.id,
                  version: analyticsCustomers.decisionVersion,
                  clickEventId: analyticsCustomers.clickEventId,
                  method: analyticsCustomers.method,
                  reason: analyticsCustomers.reason,
                  candidateGroupCount:
                    sql<number>`${evidence.candidateGroupCount}`.as(
                      "candidateGroupCount",
                    ),
                  elapsedMs: sql<number | null>`${evidence.elapsedMs}`.as(
                    "elapsedMs",
                  ),
                  sourceHost: sql<string | null>`${touch.sourceHost}`.as(
                    "sourceHost",
                  ),
                  pagePath: sql<string | null>`${touch.pagePath}`.as(
                    "pagePath",
                  ),
                  referrerHost: sql<string | null>`${touch.referrerHost}`.as(
                    "referrerHost",
                  ),
                  campaignSource: sql<
                    string | null
                  >`${touch.campaignSource}`.as("campaignSource"),
                  campaignMedium: sql<
                    string | null
                  >`${touch.campaignMedium}`.as("campaignMedium"),
                  campaignName: sql<string | null>`${touch.campaignName}`.as(
                    "campaignName",
                  ),
                  action: sql<string | null>`${touch.action}`.as("action"),
                  destination: sql<string | null>`${touch.destination}`.as(
                    "destination",
                  ),
                  firstTouchAt: sql<string | null>`${touch.firstTouchAt}`.as(
                    "firstTouchAt",
                  ),
                  firstPagePath: sql<string | null>`${touch.firstPagePath}`.as(
                    "firstPagePath",
                  ),
                  firstSource: sql<string | null>`${touch.firstSource}`.as(
                    "firstSource",
                  ),
                  ruleVersion: sql<number>`1`.as("ruleVersion"),
                  createdAt: sql<string>`${now}`.as("createdAt"),
                })
                .from(analyticsCustomers)
                .where(
                  and(
                    eq(analyticsCustomers.id, customer.id),
                    eq(analyticsCustomers.decisionVersion, version),
                  ),
                ),
            )
            .onConflictDoNothing(),
          ...(evidence.clickEventId
            ? [
                tx
                  .insert(analyticsClaims)
                  .select(
                    tx
                      .select({
                        clickEventId: sql<string>`${evidence.clickEventId}`.as(
                          "clickEventId",
                        ),
                        customerId: analyticsCustomers.id,
                        projectId: analyticsCustomers.projectId,
                      })
                      .from(analyticsCustomers)
                      .where(
                        and(
                          eq(analyticsCustomers.id, customer.id),
                          eq(
                            analyticsCustomers.clickEventId,
                            evidence.clickEventId,
                          ),
                        ),
                      ),
                  )
                  .onConflictDoUpdate({
                    target: analyticsClaims.clickEventId,
                    set: {
                      customerId: sql`CASE WHEN ${analyticsClaims.customerId} = ${customer.id} THEN ${customer.id} ELSE NULL END`,
                    },
                  }),
              ]
            : []),
        ]
      : []),
    tx.insert(analyticsOutbox).select(
      tx
        .select({
          id: sql<string>`${crypto.randomUUID()}`.as("id"),
          projectId: analyticsCustomers.projectId,
          customerId: analyticsCustomers.id,
          version: analyticsCustomers.deliveryVersion,
          decisionVersion: analyticsCustomers.decisionVersion,
          kind: sql<string>`${decide ? "acquisition" : "lifecycle"}`.as("kind"),
          outcomeId: sql<string>`${outcome.id}`.as("outcomeId"),
          createdAt: sql<string>`${now}`.as("createdAt"),
          deliveredAt: sql<null>`null`.as("deliveredAt"),
          attempts: sql<number>`0`.as("attempts"),
          nextAttemptAt: sql<string>`${now}`.as("nextAttemptAt"),
          lastError: sql<null>`null`.as("lastError"),
        })
        .from(analyticsCustomers)
        .where(eq(analyticsCustomers.id, customer.id)),
    ),
    ...(context
      ? [
          tx
            .insert(analyticsEvents)
            .values({
              id: crypto.randomUUID(),
              projectId: event.projectId,
              sourceId: event.sourceId,
              environment: event.environment,
              contextId: context.id,
              eventId: `server:${event.issuer}:${event.eventId}`,
              sessionId: context.sessionId,
              name: event.name,
              occurredAt: event.occurredAt,
              receivedAt: now,
              trust: "verified",
              policyVersion: context.policyVersion,
            })
            .onConflictDoNothing(),
        ]
      : []),
  ]);
  await enforceErasureAfterWrite(
    {
      projectId: event.projectId,
      environment: event.environment,
      issuer: event.issuer,
      externalId: event.customerId,
    },
    customer.id,
  );
  return { duplicate: false, customerId: customer.id };
}

async function validateOutcomeSource(event: ServerJourneyEvent) {
  if (Date.parse(event.occurredAt) > Date.now() + 300000)
    throw new Error("Outcome timestamp is in the future");

  const source = await repo.source(event.sourceId);
  if (
    !source ||
    !source.enabled ||
    source.projectId !== event.projectId ||
    source.environment !== event.environment
  )
    throw new Error("Unknown outcome source");
}

async function validateRefund(event: ServerJourneyEvent, customerId: string) {
  if (event.name === "refund_issued") {
    const payments = await db
      .select()
      .from(analyticsOutcomes)
      .where(
        and(
          eq(analyticsOutcomes.projectId, event.projectId),
          eq(analyticsOutcomes.environment, event.environment),
          eq(analyticsOutcomes.issuer, event.issuer),
          eq(analyticsOutcomes.paymentId, event.paymentId!),
          eq(analyticsOutcomes.customerId, customerId),
        ),
      );
    const payment = payments.find(
      (p) => p.name === "payment_succeeded" && p.currency === event.currency,
    );
    if (
      !payment ||
      payments
        .filter((p) => p.name === "refund_issued")
        .reduce((n, p) => n + (p.amountMinor ?? 0), 0) +
        (event.amountMinor ?? 0) >
        (payment.amountMinor ?? 0)
    )
      throw new Error("Refund exceeds the verified payment");
  }
}

function lifecycleFor(name: string) {
  const lifecycleOrder = [
    "identity_known",
    "enquiry_submitted",
    "registration_completed",
    "trial_started",
    "activation_achieved",
    "lead_qualified",
    "opportunity_created",
    "customer_acquired",
    "payment_succeeded",
  ];
  const lifecycleRank = sql`CASE ${analyticsCustomers.lifecycle} ${sql.join(
    lifecycleOrder.map((stageName, i) => sql`WHEN ${stageName} THEN ${i}`),
    sql` `,
  )} ELSE -1 END`;
  const lifecycle = sql<string>`CASE WHEN ${lifecycleRank} < ${lifecycleOrder.indexOf(name)} THEN ${name} ELSE ${analyticsCustomers.lifecycle} END`;
  return lifecycle;
}
