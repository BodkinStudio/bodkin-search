import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { youtubeConnections } from "@/db/schema";
export type YouTubeConnection = typeof youtubeConnections.$inferSelect;
async function getByProjectId(projectId: string) {
  const rows = await db
    .select()
    .from(youtubeConnections)
    .where(eq(youtubeConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}
async function upsert(
  input: Omit<YouTubeConnection, "id" | "createdAt" | "updatedAt">,
) {
  const [row] = await db
    .insert(youtubeConnections)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: youtubeConnections.projectId,
      set: {
        ...input,
        connectedAccountEmail: sql`case when ${youtubeConnections.connectedByUserId} = ${input.connectedByUserId} and ${youtubeConnections.youtubeAccountId} = ${input.youtubeAccountId} then coalesce(${input.connectedAccountEmail}, ${youtubeConnections.connectedAccountEmail}) else ${input.connectedAccountEmail} end`,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert youtube_connection");
  return row;
}
async function deleteByProjectId(projectId: string) {
  await db
    .delete(youtubeConnections)
    .where(eq(youtubeConnections.projectId, projectId));
}
async function existsForConnectorAccount(userId: string, accountId: string) {
  return (
    (
      await db
        .select({ id: youtubeConnections.id })
        .from(youtubeConnections)
        .where(
          and(
            eq(youtubeConnections.connectedByUserId, userId),
            eq(youtubeConnections.youtubeAccountId, accountId),
          ),
        )
        .limit(1)
    ).length > 0
  );
}
export const YouTubeConnectionRepository = {
  getByProjectId,
  upsert,
  deleteByProjectId,
  existsForConnectorAccount,
};
