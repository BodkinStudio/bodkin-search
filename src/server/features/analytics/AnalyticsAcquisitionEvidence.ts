import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsContexts,
  type analyticsCustomers,
  analyticsEntries,
  analyticsEvents,
} from "@/db/schema";
export async function acquisitionEvidence(
  context: typeof analyticsContexts.$inferSelect | undefined,
  customer: typeof analyticsCustomers.$inferSelect,
) {
  if (!context || !context.attributionAllowed)
    return {
      method: "unattributed",
      reason: context ? "permission_unavailable" : "client_observation_missing",
      clickEventId: null,
      candidateGroupCount: 0,
      elapsedMs: null,
    };
  // An exact context or an already verified same-user context may supply a touch.
  const contexts = context.userId
    ? await db
        .select({ id: analyticsContexts.id })
        .from(analyticsContexts)
        .where(
          and(
            eq(analyticsContexts.projectId, customer.projectId),
            eq(analyticsContexts.environment, customer.environment),
            eq(analyticsContexts.userIssuer, context.userIssuer!),
            eq(analyticsContexts.userId, context.userId),
            eq(analyticsContexts.attributionAllowed, true),
          ),
        )
    : [{ id: context.id }];
  for (const c of contexts) {
    const [click] = await db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.projectId, customer.projectId),
          eq(analyticsEvents.contextId, c.id),
          eq(analyticsEvents.name, "acquisition_clicked"),
          gte(
            analyticsEvents.receivedAt,
            new Date(Date.now() - 30 * 86400_000).toISOString(),
          ),
        ),
      )
      .orderBy(desc(analyticsEvents.receivedAt))
      .limit(1);
    if (click)
      return {
        method: "exact",
        reason: "verified_context",
        clickEventId: click.id,
        candidateGroupCount: 1,
        elapsedMs: Date.now() - Date.parse(click.receivedAt),
      };
  }
  const [entry] = await db
    .select()
    .from(analyticsEntries)
    .where(
      and(
        eq(analyticsEntries.projectId, customer.projectId),
        eq(analyticsEntries.contextId, context.id),
        gte(analyticsEntries.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);
  if (entry?.clickEventId) {
    const [click] = await db
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.id, entry.clickEventId),
          eq(analyticsEvents.projectId, customer.projectId),
        ),
      )
      .limit(1);
    if (!click)
      return {
        method: "unattributed",
        reason: "evidence_erased",
        clickEventId: null,
        candidateGroupCount: 0,
        elapsedMs: null,
      };
  }
  return {
    method: entry?.method ?? "unattributed",
    reason: entry?.reason ?? "client_observation_missing",
    clickEventId: entry?.clickEventId ?? null,
    candidateGroupCount: entry?.candidateGroupCount ?? 0,
    elapsedMs: entry?.elapsedMs ?? null,
  };
}
