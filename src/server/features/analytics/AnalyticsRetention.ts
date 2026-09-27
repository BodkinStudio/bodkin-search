import {
  and,
  eq,
  lt,
  lte,
  gte,
  sql,
  inArray,
  asc,
  notInArray,
} from "drizzle-orm";
import { db } from "@/db";
import { runBatch, type BatchExecutor } from "@/db/runBatch";
import {
  analyticsDailyAggregates as aggregates,
  analyticsSettings,
  analyticsSources,
  analyticsEvents,
  analyticsContexts,
  analyticsNetworkObservations,
  analyticsEntries,
  analyticsOutcomes,
  analyticsCustomers,
  analyticsClaims,
  analyticsAttributions,
} from "@/db/schema";
import { eraseCustomerRecords } from "./AnalyticsErasure";

export function retentionCutoffs(
  now: Date,
  rawDays: number,
  customerDays: number,
) {
  const cutoff = (days: number) =>
    new Date(now.getTime() - days * 86400_000).toISOString().slice(0, 10);
  const aggregate = new Date(now);
  aggregate.setUTCMonth(aggregate.getUTCMonth() - 13);
  return {
    raw: cutoff(rawDays),
    customer: cutoff(customerDays),
    aggregate: aggregate.toISOString().slice(0, 10),
  };
}
function archiveEvents(tx: BatchExecutor, projectId: string, cutoff: string) {
  const day = sql<string>`substr(${analyticsEvents.receivedAt}, 1, 10)`;
  const metrics = [
    ["events", sql<number>`count(*)`],
    [
      "page_views",
      sql<number>`sum(case when ${analyticsEvents.name} = 'page_view' then 1 else 0 end)`,
    ],
    [
      "acquisition_clicks",
      sql<number>`sum(case when ${analyticsEvents.name} = 'acquisition_clicked' then 1 else 0 end)`,
    ],
    ["visitor_days", sql<number>`count(distinct ${analyticsEvents.contextId})`],
  ] as const;
  return metrics.map(([metric, value]) =>
    tx
      .insert(aggregates)
      .select(
        tx
          .select({
            id: sql<string>`${projectId} || ':' || ${analyticsEvents.environment} || ':' || ${day} || ':' || ${metric}`.as(
              "id",
            ),
            projectId: analyticsEvents.projectId,
            environment: analyticsEvents.environment,
            day: day.as("day"),
            metric: sql<string>`${metric}`.as("metric"),
            currency: sql<string>`''`.as("currency"),
            value: value.as("value"),
          })
          .from(analyticsEvents)
          .where(
            and(
              eq(analyticsEvents.projectId, projectId),
              lt(analyticsEvents.receivedAt, cutoff),
            ),
          )
          .groupBy(analyticsEvents.projectId, analyticsEvents.environment, day),
      )
      .onConflictDoUpdate({
        target: [
          aggregates.projectId,
          aggregates.environment,
          aggregates.day,
          aggregates.metric,
          aggregates.currency,
        ],
        set: { value: sql`${aggregates.value} + excluded.value` },
      }),
  );
}
function archiveOutcomes(tx: BatchExecutor, projectId: string, cutoff: string) {
  const day = sql<string>`substr(${analyticsOutcomes.occurredAt}, 1, 10)`;
  const currency = sql<string>`coalesce(${analyticsOutcomes.currency}, '')`;
  const metrics = [
    [
      sql<string>`'outcomes:' || ${analyticsOutcomes.name}`,
      sql<number>`count(*)`,
    ],
    [
      sql<string>`case when ${analyticsOutcomes.name} = 'payment_succeeded' then 'receipts_minor' else 'refunds_minor' end`,
      sql<number>`sum(case when ${analyticsOutcomes.name} in ('payment_succeeded', 'refund_issued') then coalesce(${analyticsOutcomes.amountMinor}, 0) else 0 end)`,
    ],
  ] as const;
  return metrics.map(([metric, value]) =>
    tx
      .insert(aggregates)
      .select(
        tx
          .select({
            id: sql<string>`${projectId} || ':' || ${analyticsOutcomes.environment} || ':' || ${day} || ':' || ${metric} || ':' || ${currency}`.as(
              "id",
            ),
            projectId: analyticsOutcomes.projectId,
            environment: analyticsOutcomes.environment,
            day: day.as("day"),
            metric: metric.as("metric"),
            currency: currency.as("currency"),
            value: value.as("value"),
          })
          .from(analyticsOutcomes)
          .where(
            and(
              eq(analyticsOutcomes.projectId, projectId),
              lt(analyticsOutcomes.occurredAt, cutoff),
            ),
          )
          .groupBy(
            analyticsOutcomes.projectId,
            analyticsOutcomes.environment,
            day,
            metric,
            currency,
          ),
      )
      .onConflictDoUpdate({
        target: [
          aggregates.projectId,
          aggregates.environment,
          aggregates.day,
          aggregates.metric,
          aggregates.currency,
        ],
        set: { value: sql`${aggregates.value} + excluded.value` },
      }),
  );
}
export async function retainedDailyHistory(
  projectId: string,
  environment: string,
  from: string,
  to: string,
) {
  return db
    .select({
      day: aggregates.day,
      metric: aggregates.metric,
      currency: aggregates.currency,
      value: aggregates.value,
    })
    .from(aggregates)
    .where(
      and(
        eq(aggregates.projectId, projectId),
        eq(aggregates.environment, environment),
        gte(aggregates.day, from.slice(0, 10)),
        lte(aggregates.day, to.slice(0, 10)),
      ),
    )
    .orderBy(asc(aggregates.day))
    .limit(20000);
}
export async function purgeExpired(now = new Date()) {
  await db
    .delete(analyticsNetworkObservations)
    .where(lte(analyticsNetworkObservations.expiresAt, now.toISOString()));
  await db
    .delete(analyticsEntries)
    .where(lte(analyticsEntries.expiresAt, now.toISOString()));
  const configs = await db.select().from(analyticsSettings);
  const sources = await db
    .select({ projectId: analyticsSources.projectId })
    .from(analyticsSources);
  for (const projectId of new Set(
    [...sources, ...configs].map((s) => s.projectId),
  )) {
    const config = configs.find((c) => c.projectId === projectId);
    const cutoffs = retentionCutoffs(
      now,
      config?.retentionDays ?? 90,
      config?.customerRetentionDays ?? 395,
    );
    // Each archive and source deletion is one atomic batch: retries cannot double-count.
    await runBatch((tx) => [
      ...archiveEvents(tx, projectId, cutoffs.raw),
      tx
        .update(analyticsCustomers)
        .set({ clickEventId: null })
        .where(
          and(
            eq(analyticsCustomers.projectId, projectId),
            inArray(
              analyticsCustomers.clickEventId,
              tx
                .select({ id: analyticsEvents.id })
                .from(analyticsEvents)
                .where(
                  and(
                    eq(analyticsEvents.projectId, projectId),
                    lt(analyticsEvents.receivedAt, cutoffs.raw),
                  ),
                ),
            ),
          ),
        ),
      tx
        .update(analyticsCustomers)
        .set({ contextId: null })
        .where(
          and(
            eq(analyticsCustomers.projectId, projectId),
            inArray(
              analyticsCustomers.contextId,
              tx
                .select({ id: analyticsContexts.id })
                .from(analyticsContexts)
                .where(
                  and(
                    eq(analyticsContexts.projectId, projectId),
                    lt(analyticsContexts.lastSeenAt, cutoffs.raw),
                  ),
                ),
            ),
          ),
        ),
      tx
        .update(analyticsAttributions)
        .set({ clickEventId: null })
        .where(
          and(
            eq(analyticsAttributions.projectId, projectId),
            inArray(
              analyticsAttributions.clickEventId,
              tx
                .select({ id: analyticsEvents.id })
                .from(analyticsEvents)
                .where(
                  and(
                    eq(analyticsEvents.projectId, projectId),
                    lt(analyticsEvents.receivedAt, cutoffs.raw),
                  ),
                ),
            ),
          ),
        ),
      tx.delete(analyticsClaims).where(
        and(
          eq(analyticsClaims.projectId, projectId),
          inArray(
            analyticsClaims.clickEventId,
            tx
              .select({ id: analyticsEvents.id })
              .from(analyticsEvents)
              .where(
                and(
                  eq(analyticsEvents.projectId, projectId),
                  lt(analyticsEvents.receivedAt, cutoffs.raw),
                ),
              ),
          ),
        ),
      ),
      tx.delete(analyticsNetworkObservations).where(
        and(
          eq(analyticsNetworkObservations.projectId, projectId),
          inArray(
            analyticsNetworkObservations.eventId,
            tx
              .select({ id: analyticsEvents.id })
              .from(analyticsEvents)
              .where(
                and(
                  eq(analyticsEvents.projectId, projectId),
                  lt(analyticsEvents.receivedAt, cutoffs.raw),
                ),
              ),
          ),
        ),
      ),
      tx
        .delete(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.projectId, projectId),
            lt(analyticsEvents.receivedAt, cutoffs.raw),
          ),
        ),
      tx
        .delete(analyticsContexts)
        .where(
          and(
            eq(analyticsContexts.projectId, projectId),
            lt(analyticsContexts.lastSeenAt, cutoffs.raw),
          ),
        ),
      ...archiveOutcomes(tx, projectId, cutoffs.customer),
      tx
        .delete(analyticsOutcomes)
        .where(
          and(
            eq(analyticsOutcomes.projectId, projectId),
            lt(analyticsOutcomes.occurredAt, cutoffs.customer),
          ),
        ),
      tx
        .delete(aggregates)
        .where(
          and(
            eq(aggregates.projectId, projectId),
            lt(aggregates.day, cutoffs.aggregate),
          ),
        ),
    ]);
    // Active customer records are renewed by authoritative outcomes. Expiry is not an erasure request.
    const expired = await db
      .select({ id: analyticsCustomers.id })
      .from(analyticsCustomers)
      .where(
        and(
          eq(analyticsCustomers.projectId, projectId),
          lt(analyticsCustomers.firstSeenAt, cutoffs.customer),
          notInArray(
            analyticsCustomers.id,
            db
              .select({ id: analyticsOutcomes.customerId })
              .from(analyticsOutcomes)
              .where(eq(analyticsOutcomes.projectId, projectId)),
          ),
        ),
      );
    for (const customer of expired)
      await eraseCustomerRecords(projectId, customer.id, {
        suppressReplay: false,
        archiveAcquisitionAfter: cutoffs.aggregate,
      });
  }
  return { purgedAt: now.toISOString() };
}
