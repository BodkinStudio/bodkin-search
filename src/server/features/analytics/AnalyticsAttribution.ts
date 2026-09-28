import {
  assertIdentityNotErased,
  enforceErasureAfterWrite,
} from "./AnalyticsErasure";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsContexts,
  analyticsEvents,
  analyticsNetworkObservations,
  analyticsCustomers,
} from "@/db/schema";
import type { analyticsSources } from "@/db/schema";
import type { JourneyEvent } from "@/types/schemas/analytics";
import type { AnalyticsSecrets } from "./AnalyticsCollection";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
import {
  ANONYMOUS_CONTEXT_CLAIM,
  isAnonymousContextKey,
  verifyIdentityAssertion,
} from "./crypto";
import { matchAttribution, type EligibleClick } from "./matching";
export async function bindIdentity(
  event: JourneyEvent,
  source: typeof analyticsSources.$inferSelect,
  context: typeof analyticsContexts.$inferSelect,
  secrets: AnalyticsSecrets,
) {
  if (!event.identityAssertion) return;
  if (!event.consent.identity || !secrets.identitySecret)
    throw new Error("Identity permission or verification unavailable");
  const claims = await verifyIdentityAssertion(
    event.identityAssertion,
    secrets.identitySecret,
    {
      projectId: source.projectId,
      sourceId: source.id,
      // An anonymous page cannot know its server-derived key, so it signs a
      // fixed claim; the assertion stays bound to project, source and expiry.
      contextId: isAnonymousContextKey(context.contextKey)
        ? ANONYMOUS_CONTEXT_CLAIM
        : context.contextKey,
    },
  );
  if (
    context.userId &&
    (context.userId !== claims.userId || context.userIssuer !== claims.issuer)
  )
    throw new Error("Reset context before switching accounts");
  const config = await repo.settings(source.projectId);
  const externalId =
    config.businessModel === "individual"
      ? claims.userId
      : claims.organizationId;
  if (!externalId) throw new Error("Verified customer key required");
  await assertIdentityNotErased({
    projectId: source.projectId,
    environment: source.environment,
    issuer: claims.issuer,
    externalId,
  });
  const key = and(
    eq(analyticsCustomers.projectId, source.projectId),
    eq(analyticsCustomers.environment, source.environment),
    eq(analyticsCustomers.issuer, claims.issuer),
    eq(analyticsCustomers.externalId, externalId),
  );
  await db
    .insert(analyticsCustomers)
    .values({
      id: crypto.randomUUID(),
      projectId: source.projectId,
      environment: source.environment,
      issuer: claims.issuer,
      externalId,
      firstSeenAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
  const [customer] = await db.select().from(analyticsCustomers).where(key);
  if (!customer) throw new Error("Identity binding failed");
  await db
    .update(analyticsContexts)
    .set({
      userIssuer: claims.issuer,
      userId: claims.userId,
      customerId: customer.id,
    })
    .where(eq(analyticsContexts.id, context.id));
  await enforceErasureAfterWrite(
    {
      projectId: source.projectId,
      environment: source.environment,
      issuer: claims.issuer,
      externalId,
    },
    customer.id,
  );
}
export async function candidateFor(
  context: typeof analyticsContexts.$inferSelect,
  entryEvent: typeof analyticsEvents.$inferSelect,
) {
  const config = await repo.settings(context.projectId);
  const cutoff = new Date(
    Date.parse(entryEvent.receivedAt) - config.matchingWindowHours * 3600_000,
  ).toISOString();
  const clicks = await db
    .select()
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.projectId, context.projectId),
        eq(analyticsEvents.environment, context.environment),
        eq(analyticsEvents.name, "acquisition_clicked"),
        gte(analyticsEvents.receivedAt, cutoff),
        lte(analyticsEvents.receivedAt, entryEvent.receivedAt),
      ),
    )
    .limit(5000);
  const observations = await db
    .select()
    .from(analyticsNetworkObservations)
    .where(
      and(
        eq(analyticsNetworkObservations.projectId, context.projectId),
        eq(analyticsNetworkObservations.environment, context.environment),
        gte(analyticsNetworkObservations.expiresAt, new Date().toISOString()),
      ),
    );
  const keys = (id: string) =>
    observations
      .filter((o) => o.eventId === id)
      .map((o) => ({ epoch: o.epoch, key: o.networkKey }));
  const candidates: EligibleClick[] = clicks
    .filter((c) => c.destination)
    .map((c) => ({
      id: c.id,
      contextId: c.contextId,
      projectId: c.projectId,
      environment: c.environment,
      destination: c.destination!,
      receivedAt: c.receivedAt,
      networkKeys: keys(c.id),
      attributionPermitted: true,
    }));
  return matchAttribution(
    candidates,
    {
      projectId: context.projectId,
      environment: context.environment,
      destination: entryEvent.destination ?? "product",
      receivedAt: entryEvent.receivedAt,
      networkKeys: keys(entryEvent.id),
      attributionPermitted: context.attributionAllowed,
      exactContextId: context.id,
    },
    config.matchingWindowHours * 3600_000,
  );
}
