import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  linkedinPageConnections,
  linkedinPageOverviewCaches,
} from "@/db/schema";
export const LinkedInPageApiRepository = {
  getConnection: async (projectId: string) =>
    (
      await db
        .select()
        .from(linkedinPageConnections)
        .where(eq(linkedinPageConnections.projectId, projectId))
        .limit(1)
    )[0] ?? null,
  upsertConnection: async (
    input: Omit<
      typeof linkedinPageConnections.$inferInsert,
      "id" | "createdAt" | "updatedAt"
    >,
  ) =>
    (
      await db
        .insert(linkedinPageConnections)
        .values({ id: crypto.randomUUID(), ...input })
        .onConflictDoUpdate({
          target: linkedinPageConnections.projectId,
          set: { ...input, updatedAt: sql`(current_timestamp)` },
        })
        .returning()
    )[0],
  deleteConnection: (projectId: string) =>
    db
      .delete(linkedinPageConnections)
      .where(eq(linkedinPageConnections.projectId, projectId)),
  getCache: async (
    projectId: string,
    pageId: string,
    startDate: string,
    endDate: string,
  ) =>
    (
      await db
        .select()
        .from(linkedinPageOverviewCaches)
        .where(
          and(
            eq(linkedinPageOverviewCaches.projectId, projectId),
            eq(linkedinPageOverviewCaches.pageId, pageId),
            eq(linkedinPageOverviewCaches.startDate, startDate),
            eq(linkedinPageOverviewCaches.endDate, endDate),
          ),
        )
        .limit(1)
    )[0] ?? null,
  putCache: async (
    input: Omit<typeof linkedinPageOverviewCaches.$inferInsert, "id">,
  ) =>
    (
      await db
        .insert(linkedinPageOverviewCaches)
        .values({ id: crypto.randomUUID(), ...input })
        .onConflictDoUpdate({
          target: [
            linkedinPageOverviewCaches.projectId,
            linkedinPageOverviewCaches.pageId,
            linkedinPageOverviewCaches.startDate,
            linkedinPageOverviewCaches.endDate,
          ],
          set: input,
        })
        .returning()
    )[0],
  deleteCaches: (projectId: string) =>
    db
      .delete(linkedinPageOverviewCaches)
      .where(eq(linkedinPageOverviewCaches.projectId, projectId)),
  /** Bounded retention cleanup; callers may invoke this on reads and daily jobs. */
  purgeExpiredCaches: (retainBefore: string) =>
    db
      .delete(linkedinPageOverviewCaches)
      .where(lt(linkedinPageOverviewCaches.retrievedAt, retainBefore)),
  countConnectionsForGrant: async (userId: string, accountId: string) =>
    (
      await db
        .select({ id: linkedinPageConnections.id })
        .from(linkedinPageConnections)
        .where(
          and(
            eq(linkedinPageConnections.connectedByUserId, userId),
            eq(linkedinPageConnections.linkedinAccountId, accountId),
          ),
        )
        .limit(2)
    ).length,
};
