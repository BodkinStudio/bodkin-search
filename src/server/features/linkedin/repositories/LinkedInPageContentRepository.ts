import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { linkedinPageImports, linkedinPagePostMetrics } from "@/db/schema";
import type { LinkedInPostImport } from "@/types/schemas/linkedin";

type BatchExecutor = Parameters<Parameters<typeof runBatch>[0]>[0];
export type LinkedInImportRecord = typeof linkedinPageImports.$inferSelect;
export type LinkedInPostMetricRecord =
  typeof linkedinPagePostMetrics.$inferSelect;

export const LINKEDIN_POST_ROWS_PER_INSERT = 6;

export type StoredLinkedInPost = LinkedInPostImport & {
  postKey: string;
};

type ReplaceLinkedInImport = {
  id: string;
  projectId: string;
  pageName: string;
  startDate: string;
  endDate: string;
  importedAt: string;
  posts: StoredLinkedInPost[];
};

export function chunkLinkedInPosts<T>(rows: T[]): T[][] {
  const chunks: T[][] = [];
  for (
    let index = 0;
    index < rows.length;
    index += LINKEDIN_POST_ROWS_PER_INSERT
  ) {
    chunks.push(rows.slice(index, index + LINKEDIN_POST_ROWS_PER_INSERT));
  }
  return chunks;
}

function postInsertStatements(
  executor: BatchExecutor,
  importId: string,
  posts: StoredLinkedInPost[],
) {
  return chunkLinkedInPosts(posts).map((chunk) =>
    executor.insert(linkedinPagePostMetrics).values(
      chunk.map((post) => ({
        id: crypto.randomUUID(),
        importId,
        postKey: post.postKey,
        postUrl: post.postUrl,
        postText: post.postText,
        publishedAt: post.publishedAt,
        impressions: post.impressions,
        membersReached: post.membersReached,
        videoViews: post.videoViews,
        clicks: post.clicks,
        reactions: post.reactions,
        comments: post.comments,
        reposts: post.reposts,
        follows: post.follows,
        providerClickThroughRate:
          post.providerClickThroughRate === null
            ? null
            : Math.round(post.providerClickThroughRate * 100),
        providerEngagementRate:
          post.providerEngagementRate === null
            ? null
            : Math.round(post.providerEngagementRate * 100),
      })),
    ),
  );
}

async function replaceImport(input: ReplaceLinkedInImport): Promise<void> {
  await runBatch((executor) => [
    executor
      .delete(linkedinPageImports)
      .where(
        and(
          eq(linkedinPageImports.projectId, input.projectId),
          eq(linkedinPageImports.startDate, input.startDate),
          eq(linkedinPageImports.endDate, input.endDate),
        ),
      ),
    executor.insert(linkedinPageImports).values({
      id: input.id,
      projectId: input.projectId,
      pageName: input.pageName,
      startDate: input.startDate,
      endDate: input.endDate,
      importedAt: input.importedAt,
      rowCount: input.posts.length,
    }),
    ...postInsertStatements(executor, input.id, input.posts),
  ]);
}

async function findLatestImport(
  projectId: string,
): Promise<LinkedInImportRecord | null> {
  const [row] = await db
    .select()
    .from(linkedinPageImports)
    .where(eq(linkedinPageImports.projectId, projectId))
    .orderBy(desc(linkedinPageImports.importedAt), desc(linkedinPageImports.id))
    .limit(1);
  return row ?? null;
}

async function findImportByPeriod(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<LinkedInImportRecord | null> {
  const [row] = await db
    .select()
    .from(linkedinPageImports)
    .where(
      and(
        eq(linkedinPageImports.projectId, projectId),
        eq(linkedinPageImports.startDate, startDate),
        eq(linkedinPageImports.endDate, endDate),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listPosts(
  importId: string,
): Promise<LinkedInPostMetricRecord[]> {
  return db
    .select()
    .from(linkedinPagePostMetrics)
    .where(eq(linkedinPagePostMetrics.importId, importId))
    .orderBy(asc(linkedinPagePostMetrics.postKey));
}

async function listTopPosts(
  importId: string,
  limit: number,
): Promise<LinkedInPostMetricRecord[]> {
  return db
    .select()
    .from(linkedinPagePostMetrics)
    .where(eq(linkedinPagePostMetrics.importId, importId))
    .orderBy(
      asc(
        sql`CASE WHEN ${linkedinPagePostMetrics.impressions} IS NULL THEN 1 ELSE 0 END`,
      ),
      desc(linkedinPagePostMetrics.impressions),
      desc(linkedinPagePostMetrics.publishedAt),
      asc(linkedinPagePostMetrics.postKey),
    )
    .limit(limit);
}

export const LinkedInPageContentRepository = {
  replaceImport,
  findLatestImport,
  findImportByPeriod,
  listPosts,
  listTopPosts,
} as const;

export type LinkedInPageContentRepositoryContract =
  typeof LinkedInPageContentRepository;
