import { and, asc, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import {
  growthActionTargets,
  growthActions,
  growthChangeEventUrls,
  growthChangeEvents,
  growthMeasurementPlans,
  growthRecommendationTargets,
  growthRecommendations,
  projectKeyPages,
  rankCheckRuns,
  rankSnapshots,
  rankTrackingConfigs,
  rankTrackingKeywords,
} from "@/db/schema";

function codeUnit(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column} COLLATE "C"`
    : sql`${column} COLLATE BINARY`;
}
const operational = [
  "approved",
  "ready",
  "in_progress",
  "blocked",
  "implemented",
  "measuring",
] as const;

async function keyPage(projectId: string, url: string) {
  const [row] = await db
    .select({
      role: projectKeyPages.role,
      commercialWeight: projectKeyPages.commercialWeight,
      protected: projectKeyPages.protected,
      activelyOptimized: projectKeyPages.activelyOptimized,
      topic: projectKeyPages.topic,
      notes: projectKeyPages.notes,
      updatedAt: projectKeyPages.updatedAt,
    })
    .from(projectKeyPages)
    .where(
      and(
        eq(projectKeyPages.projectId, projectId),
        eq(projectKeyPages.url, url),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function recommendations(
  projectId: string,
  url: string,
  asOf: string,
  limit: number,
) {
  return db
    .select({
      id: growthRecommendations.id,
      status: growthRecommendations.status,
      title: growthRecommendations.title,
      priorityScore: growthRecommendations.priorityScore,
      createdAt: growthRecommendations.createdAt,
    })
    .from(growthRecommendations)
    .innerJoin(
      growthRecommendationTargets,
      and(
        eq(
          growthRecommendationTargets.projectId,
          growthRecommendations.projectId,
        ),
        eq(
          growthRecommendationTargets.recommendationId,
          growthRecommendations.id,
        ),
      ),
    )
    .where(
      and(
        eq(growthRecommendations.projectId, projectId),
        eq(growthRecommendationTargets.targetType, "url"),
        eq(growthRecommendationTargets.targetValue, url),
        lte(growthRecommendations.createdAt, asOf),
        or(
          eq(growthRecommendations.status, "proposed"),
          eq(growthRecommendations.status, "snoozed"),
          and(
            eq(growthRecommendations.status, "accepted"),
            sql`NOT EXISTS (SELECT 1 FROM growth_actions AS page_context_actions WHERE page_context_actions.project_id = ${growthRecommendations.projectId} AND page_context_actions.recommendation_id = ${growthRecommendations.id} AND page_context_actions.created_at <= ${asOf})`,
          ),
        ),
      ),
    )
    .orderBy(
      desc(growthRecommendations.priorityScore),
      desc(growthRecommendations.createdAt),
      asc(codeUnit(growthRecommendations.id)),
    )
    .limit(limit);
}
async function actions(
  projectId: string,
  url: string,
  asOf: string,
  limit: number,
) {
  return db
    .select({
      id: growthActions.id,
      status: growthActions.status,
      title: growthActions.title,
      priorityScore: growthActions.priorityScore,
      dueAt: growthActions.dueAt,
      updatedAt: growthActions.updatedAt,
    })
    .from(growthActions)
    .innerJoin(
      growthActionTargets,
      and(
        eq(growthActionTargets.projectId, growthActions.projectId),
        eq(growthActionTargets.actionId, growthActions.id),
      ),
    )
    .where(
      and(
        eq(growthActions.projectId, projectId),
        eq(growthActionTargets.targetType, "url"),
        eq(growthActionTargets.targetValue, url),
        lte(growthActions.createdAt, asOf),
        inArray(growthActions.status, operational),
      ),
    )
    .orderBy(
      desc(growthActions.priorityScore),
      asc(growthActions.dueAt),
      asc(codeUnit(growthActions.id)),
    )
    .limit(limit);
}
async function changes(
  projectId: string,
  url: string,
  asOf: string,
  limit: number,
) {
  return db
    .select({
      id: growthChangeEvents.id,
      source: growthChangeEvents.source,
      changeType: growthChangeEvents.changeType,
      description: growthChangeEvents.description,
      happenedAt: growthChangeEvents.happenedAt,
    })
    .from(growthChangeEvents)
    .innerJoin(
      growthChangeEventUrls,
      and(
        eq(growthChangeEventUrls.projectId, growthChangeEvents.projectId),
        eq(growthChangeEventUrls.changeEventId, growthChangeEvents.id),
      ),
    )
    .where(
      and(
        eq(growthChangeEvents.projectId, projectId),
        eq(growthChangeEventUrls.url, url),
        lte(growthChangeEvents.createdAt, asOf),
        lte(growthChangeEvents.happenedAt, asOf),
      ),
    )
    .orderBy(
      desc(growthChangeEvents.happenedAt),
      asc(codeUnit(growthChangeEvents.id)),
    )
    .limit(limit);
}
async function measurements(
  projectId: string,
  url: string,
  asOf: string,
  limit: number,
) {
  return db
    .select({
      id: growthMeasurementPlans.id,
      actionId: growthMeasurementPlans.actionId,
      actionVersion: growthMeasurementPlans.actionVersion,
      reportTimezone: growthMeasurementPlans.reportTimezone,
      measurementEnd: growthMeasurementPlans.measurementEnd,
      longMeasurementEnd: growthMeasurementPlans.longMeasurementEnd,
      actionStatus: growthActions.status,
      actionStateVersion: growthActions.stateVersion,
    })
    .from(growthMeasurementPlans)
    .innerJoin(
      growthActions,
      and(
        eq(growthActions.projectId, growthMeasurementPlans.projectId),
        eq(growthActions.id, growthMeasurementPlans.actionId),
      ),
    )
    .innerJoin(
      growthActionTargets,
      and(
        eq(growthActionTargets.projectId, growthActions.projectId),
        eq(growthActionTargets.actionId, growthActions.id),
      ),
    )
    .where(
      and(
        eq(growthMeasurementPlans.projectId, projectId),
        eq(growthMeasurementPlans.status, "active"),
        lte(growthMeasurementPlans.createdAt, asOf),
        lte(growthActions.createdAt, asOf),
        eq(growthActionTargets.targetType, "url"),
        eq(growthActionTargets.targetValue, url),
      ),
    )
    .orderBy(
      asc(
        sql`COALESCE(${growthMeasurementPlans.longMeasurementEnd}, ${growthMeasurementPlans.measurementEnd})`,
      ),
      asc(codeUnit(growthMeasurementPlans.id)),
    )
    .limit(limit);
}
async function ranks(
  projectId: string,
  asOf: string,
  candidateUrls: string[],
  limit: number,
) {
  if (candidateUrls.length === 0) return [];
  const provider = getDatabaseProvider();
  const semanticTime = (value: SQLWrapper) =>
    provider === "postgres" ? value : sql`julianday(${value})`;
  const cutoff = semanticTime(sql`${asOf}`);
  const completedAt = semanticTime(rankCheckRuns.completedAt);
  const checkedAt = semanticTime(rankSnapshots.checkedAt);
  const ranked = db.$with("page_context_ranked").as(
    db
      .select({
        trackingKeywordId: rankSnapshots.trackingKeywordId,
        keyword: rankSnapshots.keyword,
        device: rankSnapshots.device,
        position: rankSnapshots.position,
        url: rankSnapshots.url,
        checkedAt: rankSnapshots.checkedAt,
        completedAt: rankCheckRuns.completedAt,
        snapshotId: sql<number>`${rankSnapshots.id}`.as(
          "page_context_snapshot_id",
        ),
        winner:
          sql<number>`ROW_NUMBER() OVER (PARTITION BY ${rankTrackingConfigs.id}, ${rankSnapshots.trackingKeywordId}, ${rankSnapshots.device} ORDER BY ${completedAt} DESC, ${checkedAt} DESC, ${rankSnapshots.id} DESC)`.as(
            "winner",
          ),
      })
      .from(rankSnapshots)
      .innerJoin(
        rankCheckRuns,
        and(
          eq(rankCheckRuns.id, rankSnapshots.runId),
          eq(rankCheckRuns.projectId, projectId),
        ),
      )
      .innerJoin(
        rankTrackingConfigs,
        and(
          eq(rankTrackingConfigs.id, rankCheckRuns.configId),
          eq(rankTrackingConfigs.projectId, projectId),
        ),
      )
      .innerJoin(
        rankTrackingKeywords,
        and(
          eq(rankTrackingKeywords.id, rankSnapshots.trackingKeywordId),
          eq(rankTrackingKeywords.configId, rankTrackingConfigs.id),
        ),
      )
      .where(
        and(
          eq(rankTrackingConfigs.projectId, projectId),
          eq(rankTrackingConfigs.isActive, true),
          eq(rankCheckRuns.status, "completed"),
          lte(completedAt, cutoff),
          lte(checkedAt, cutoff),
        ),
      ),
  );
  return db
    .with(ranked)
    .select({
      trackingKeywordId: ranked.trackingKeywordId,
      keyword: ranked.keyword,
      device: ranked.device,
      position: ranked.position,
      checkedAt: ranked.checkedAt,
      snapshotId: ranked.snapshotId,
    })
    .from(ranked)
    .where(and(eq(ranked.winner, 1), inArray(ranked.url, candidateUrls)))
    .orderBy(
      asc(sql`CASE WHEN ${ranked.position} IS NULL THEN 1 ELSE 0 END`),
      asc(ranked.position),
      asc(codeUnit(ranked.keyword)),
      asc(codeUnit(ranked.device)),
      asc(codeUnit(ranked.trackingKeywordId)),
      asc(ranked.snapshotId),
    )
    .limit(limit);
}
export const GrowthPageContextRepository = {
  keyPage,
  recommendations,
  actions,
  changes,
  measurements,
  ranks,
} as const;
