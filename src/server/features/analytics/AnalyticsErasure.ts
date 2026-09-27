import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  analyticsContexts,
  analyticsEvents,
  analyticsNetworkObservations,
  analyticsEntries,
  analyticsCustomers,
  analyticsOutcomes,
  analyticsOutbox,
  analyticsAttributions,
  analyticsClaims,
  analyticsTombstones,
  analyticsErasureKeys,
  analyticsAudit,
  analyticsDailyAggregates,
} from "@/db/schema";
import { signBackendRequest } from "./crypto";

type Identity = {
  projectId: string;
  environment: string;
  issuer: string;
  externalId: string;
};
async function erasureSecret() {
  const { env } = await import("cloudflare:workers");
  if (!env.ANALYTICS_ERASURE_HMAC_SECRET)
    throw new Error(
      "Configure ANALYTICS_ERASURE_HMAC_SECRET before processing erased identities",
    );
  return env.ANALYTICS_ERASURE_HMAC_SECRET;
}
export async function identityErasureKey(identity: Identity, secret: string) {
  // A versioned, domain-separated HMAC includes project and environment; no raw ID is stored.
  return signBackendRequest(
    secret,
    "analytics-erasure-v1",
    JSON.stringify([
      identity.projectId,
      identity.environment,
      identity.issuer,
      identity.externalId,
    ]),
  );
}
export async function assertIdentityNotErased(
  identity: Identity,
  secret?: string,
) {
  const [ledger] = await db
    .select({ id: analyticsErasureKeys.id })
    .from(analyticsErasureKeys)
    .where(eq(analyticsErasureKeys.projectId, identity.projectId))
    .limit(1);
  if (!ledger) return;
  const identityKey = await identityErasureKey(
    identity,
    secret ?? (await erasureSecret()),
  );
  const [erased] = await db
    .select({ id: analyticsErasureKeys.id })
    .from(analyticsErasureKeys)
    .where(
      and(
        eq(analyticsErasureKeys.projectId, identity.projectId),
        eq(analyticsErasureKeys.identityKey, identityKey),
      ),
    )
    .limit(1);
  if (erased) throw new Error("Identity is unavailable for analytics");
}

/** Erase personal records, keeping only context and protected identity replay suppression. */
export async function eraseCustomerRecords(
  projectId: string,
  customerId: string,
  options: {
    secret?: string;
    suppressReplay?: boolean;
    archiveAcquisitionAfter?: string;
  } = {},
) {
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
  const now = new Date().toISOString();
  const identityKey =
    !customer || options.suppressReplay === false
      ? null
      : await identityErasureKey(
          customer,
          options.secret ?? (await erasureSecret()),
        );
  await runBatch((tx) => {
    const contexts = tx
      .select({ id: analyticsContexts.id })
      .from(analyticsContexts)
      .where(
        and(
          eq(analyticsContexts.projectId, projectId),
          eq(analyticsContexts.customerId, customerId),
        ),
      );
    const eventIds = tx
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.projectId, projectId),
          inArray(analyticsEvents.contextId, contexts),
        ),
      );
    return [
      ...(options.archiveAcquisitionAfter &&
      customer?.acquiredAt &&
      customer.acquiredAt.slice(0, 10) >= options.archiveAcquisitionAfter
        ? [
            tx
              .insert(analyticsDailyAggregates)
              .select(
                tx
                  .select({
                    id: sql<string>`${crypto.randomUUID()}`.as("id"),
                    projectId: analyticsCustomers.projectId,
                    environment: analyticsCustomers.environment,
                    day: sql<string>`substr(${analyticsCustomers.acquiredAt}, 1, 10)`.as(
                      "day",
                    ),
                    metric: sql<string>`'acquired_customers'`.as("metric"),
                    currency: sql<string>`''`.as("currency"),
                    value: sql<number>`1`.as("value"),
                  })
                  .from(analyticsCustomers)
                  .where(
                    and(
                      eq(analyticsCustomers.projectId, projectId),
                      eq(analyticsCustomers.id, customerId),
                    ),
                  ),
              )
              .onConflictDoUpdate({
                target: [
                  analyticsDailyAggregates.projectId,
                  analyticsDailyAggregates.environment,
                  analyticsDailyAggregates.day,
                  analyticsDailyAggregates.metric,
                  analyticsDailyAggregates.currency,
                ],
                set: {
                  value: sql`${analyticsDailyAggregates.value} + excluded.value`,
                },
              }),
          ]
        : []),
      ...(identityKey
        ? [
            tx
              .insert(analyticsErasureKeys)
              .values({
                id: crypto.randomUUID(),
                projectId,
                identityKey,
                erasedAt: now,
              })
              .onConflictDoNothing(),
          ]
        : []),
      // Insert one tombstone per context before deleting the records. Existing withdrawals survive.
      tx
        .insert(analyticsTombstones)
        .select(
          tx
            .select({
              id: analyticsContexts.id,
              projectId: analyticsContexts.projectId,
              sourceId: analyticsContexts.sourceId,
              contextKey: analyticsContexts.contextKey,
              erasedAt: sql<string>`${now}`.as("erased_at"),
            })
            .from(analyticsContexts)
            .where(
              and(
                eq(analyticsContexts.projectId, projectId),
                eq(analyticsContexts.customerId, customerId),
              ),
            ),
        )
        .onConflictDoNothing(),
      tx
        .delete(analyticsNetworkObservations)
        .where(
          and(
            eq(analyticsNetworkObservations.projectId, projectId),
            inArray(analyticsNetworkObservations.eventId, eventIds),
          ),
        ),
      tx
        .delete(analyticsEntries)
        .where(
          and(
            eq(analyticsEntries.projectId, projectId),
            inArray(analyticsEntries.contextId, contexts),
          ),
        ),
      tx
        .delete(analyticsEvents)
        .where(
          and(
            eq(analyticsEvents.projectId, projectId),
            inArray(analyticsEvents.contextId, contexts),
          ),
        ),
      tx
        .delete(analyticsAudit)
        .where(
          and(
            eq(analyticsAudit.projectId, projectId),
            eq(analyticsAudit.entity, `customer:${customerId}`),
          ),
        ),
      tx
        .delete(analyticsOutbox)
        .where(
          and(
            eq(analyticsOutbox.projectId, projectId),
            eq(analyticsOutbox.customerId, customerId),
          ),
        ),
      tx
        .delete(analyticsAttributions)
        .where(
          and(
            eq(analyticsAttributions.projectId, projectId),
            eq(analyticsAttributions.customerId, customerId),
          ),
        ),
      tx
        .delete(analyticsClaims)
        .where(
          and(
            eq(analyticsClaims.projectId, projectId),
            eq(analyticsClaims.customerId, customerId),
          ),
        ),
      tx
        .delete(analyticsOutcomes)
        .where(
          and(
            eq(analyticsOutcomes.projectId, projectId),
            eq(analyticsOutcomes.customerId, customerId),
          ),
        ),
      tx
        .delete(analyticsContexts)
        .where(
          and(
            eq(analyticsContexts.projectId, projectId),
            eq(analyticsContexts.customerId, customerId),
          ),
        ),
      tx
        .delete(analyticsCustomers)
        .where(
          and(
            eq(analyticsCustomers.projectId, projectId),
            eq(analyticsCustomers.id, customerId),
          ),
        ),
    ];
  });
}

/** Check again after writes so a concurrent erasure cannot recreate personal records. */
export async function enforceErasureAfterWrite(
  identity: Identity,
  customerId: string,
) {
  try {
    await assertIdentityNotErased(identity);
  } catch (error) {
    await eraseCustomerRecords(identity.projectId, customerId, {
      suppressReplay: false,
    });
    throw error;
  }
}

/** Run with ingestion/delivery paused after restoring the current protected ledger. */
export async function replayErasureLedger(projectId: string, secret?: string) {
  const ledger = await db
    .select({ key: analyticsErasureKeys.identityKey })
    .from(analyticsErasureKeys)
    .where(eq(analyticsErasureKeys.projectId, projectId));
  if (!ledger.length) return { erased: 0 };
  const key = secret ?? (await erasureSecret());
  const suppressed = new Set(ledger.map((entry) => entry.key));
  const customers = await db
    .select()
    .from(analyticsCustomers)
    .where(eq(analyticsCustomers.projectId, projectId));
  let erased = 0;
  for (const customer of customers) {
    if (!suppressed.has(await identityErasureKey(customer, key))) continue;
    await eraseCustomerRecords(projectId, customer.id, {
      suppressReplay: false,
    });
    erased++;
  }
  return { erased };
}
