import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsSettings,
  analyticsSources,
  analyticsContexts,
  analyticsEvents,
  analyticsCustomers,
  analyticsOutcomes,
} from "@/db/schema";
import type { AnalyticsQuery } from "@/types/schemas/analytics";
const defaults = {
  businessModel: "organisation",
  primaryOutcome: "registration_completed",
  matchingWindowHours: 24,
  retentionDays: 90,
  customerRetentionDays: 395,
  personalAccess: false,
  webhookUrl: null,
  anonymousCollection: false,
  weeklyMqlTarget: null,
};
async function settings(projectId: string) {
  return (
    (
      await db
        .select()
        .from(analyticsSettings)
        .where(eq(analyticsSettings.projectId, projectId))
        .limit(1)
    )[0] ?? { projectId, ...defaults, updatedAt: new Date().toISOString() }
  );
}
async function source(id: string) {
  return (
    await db
      .select()
      .from(analyticsSources)
      .where(eq(analyticsSources.id, id))
      .limit(1)
  )[0];
}
async function context(
  projectId: string,
  sourceId: string,
  contextKey: string,
) {
  return (
    await db
      .select()
      .from(analyticsContexts)
      .where(
        and(
          eq(analyticsContexts.projectId, projectId),
          eq(analyticsContexts.sourceId, sourceId),
          eq(analyticsContexts.contextKey, contextKey),
        ),
      )
      .limit(1)
  )[0];
}
/** The customer's most recently seen context that permits attribution. */
async function latestJourney(customer: typeof analyticsCustomers.$inferSelect) {
  return (
    await db
      .select()
      .from(analyticsContexts)
      .where(
        and(
          eq(analyticsContexts.projectId, customer.projectId),
          eq(analyticsContexts.environment, customer.environment),
          eq(analyticsContexts.customerId, customer.id),
          eq(analyticsContexts.attributionAllowed, true),
        ),
      )
      .orderBy(desc(analyticsContexts.lastSeenAt))
      .limit(1)
  )[0];
}
function windowFor(q: AnalyticsQuery) {
  return {
    from: q.from ?? new Date(Date.now() - 30 * 86400_000).toISOString(),
    to: q.to ?? new Date().toISOString(),
  };
}
async function events(q: AnalyticsQuery) {
  const w = windowFor(q);
  const rows = await db
    .select()
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.projectId, q.projectId),
        eq(analyticsEvents.environment, q.environment),
        gte(analyticsEvents.receivedAt, w.from),
        lte(analyticsEvents.receivedAt, w.to),
      ),
    )
    .orderBy(asc(analyticsEvents.receivedAt), asc(analyticsEvents.sequence))
    .limit(20001);
  if (rows.length > 20000)
    throw new Error(
      "Reporting limit reached; choose a shorter period or archive older customer detail",
    );
  return rows;
}
async function customers(q: AnalyticsQuery) {
  const rows = await db
    .select()
    .from(analyticsCustomers)
    .where(
      and(
        eq(analyticsCustomers.projectId, q.projectId),
        eq(analyticsCustomers.environment, q.environment),
      ),
    )
    .limit(10001);
  if (rows.length > 10000)
    throw new Error(
      "Reporting limit reached; choose a shorter period or archive older customer detail",
    );
  return rows;
}
async function outcomes(q: AnalyticsQuery) {
  const w = windowFor(q);
  const rows = await db
    .select()
    .from(analyticsOutcomes)
    .where(
      and(
        eq(analyticsOutcomes.projectId, q.projectId),
        eq(analyticsOutcomes.environment, q.environment),
        gte(analyticsOutcomes.occurredAt, w.from),
        lte(analyticsOutcomes.occurredAt, w.to),
      ),
    )
    .limit(20001);
  if (rows.length > 20000)
    throw new Error(
      "Reporting limit reached; choose a shorter period or archive older customer detail",
    );
  return rows;
}
export const AnalyticsRepository = {
  settings,
  source,
  context,
  latestJourney,
  events,
  customers,
  outcomes,
  windowFor,
  customerContexts,
  contextEvents,
};
/** The visitor contexts identified as these customers. */
async function customerContexts(projectId: string, environment: string, customerIds: string[]) {
  if (!customerIds.length) return [];
  return db
    .select({ id: analyticsContexts.id, customerId: analyticsContexts.customerId })
    .from(analyticsContexts)
    .where(
      and(
        eq(analyticsContexts.projectId, projectId),
        eq(analyticsContexts.environment, environment),
        inArray(analyticsContexts.customerId, customerIds.slice(0, 1000)),
      ),
    )
    .limit(5001);
}
/** Every event of these contexts in a window, in order: the journeys behind outcomes. */
async function contextEvents(projectId: string, contextIds: string[], from: string, to: string) {
  if (!contextIds.length) return [];
  const rows = await db
    .select()
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.projectId, projectId),
        inArray(analyticsEvents.contextId, contextIds.slice(0, 2000)),
        gte(analyticsEvents.receivedAt, from),
        lte(analyticsEvents.receivedAt, to),
      ),
    )
    .orderBy(asc(analyticsEvents.receivedAt), asc(analyticsEvents.sequence))
    .limit(20001);
  if (rows.length > 20000) throw new Error("Reporting limit reached; choose a shorter period");
  return rows;
}
