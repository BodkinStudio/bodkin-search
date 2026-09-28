import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import {
  growthRecommendations,
  growthRecommendationSteps,
  growthRecommendationTargets,
} from "@/db/schema";
import type { GrowthPriorityRecommendationsRequest } from "@/types/schemas/growth-priority-recommendations";

function codeUnitId(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column} COLLATE "C"`
    : sql`${column} COLLATE BINARY`;
}

/** Normalize SQLite's UTC `current_timestamp` text before cursor comparison. */
function chronological(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column}`
    : sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${column})`;
}

async function listRecommendationsPage(
  input: GrowthPriorityRecommendationsRequest,
) {
  const { projectId, statuses, category, minPriorityScore, limit, cursor } =
    input;
  const recommendationId = codeUnitId(growthRecommendations.id);
  const eligibleStatuses = statuses ?? ["proposed", "snoozed", "accepted"];
  const createdAt = chronological(growthRecommendations.createdAt);
  const afterCursor = cursor
    ? or(
        lt(growthRecommendations.priorityScore, cursor.priorityScore),
        and(
          eq(growthRecommendations.priorityScore, cursor.priorityScore),
          lt(createdAt, cursor.createdAt),
        ),
        and(
          eq(growthRecommendations.priorityScore, cursor.priorityScore),
          eq(createdAt, cursor.createdAt),
          lt(recommendationId, cursor.id),
        ),
      )
    : undefined;
  return db
    .select({
      id: growthRecommendations.id,
      title: growthRecommendations.title,
      rationale: growthRecommendations.rationale,
      category: growthRecommendations.category,
      impact: growthRecommendations.impact,
      commercialRelevance: growthRecommendations.commercialRelevance,
      effort: growthRecommendations.effort,
      urgency: growthRecommendations.urgency,
      confidence: growthRecommendations.confidence,
      priorityScore: growthRecommendations.priorityScore,
      status: growthRecommendations.status,
      reviewVersion: growthRecommendations.reviewVersion,
      snoozedUntil: growthRecommendations.snoozedUntil,
      reviewedAt: growthRecommendations.reviewedAt,
      createdAt: growthRecommendations.createdAt,
    })
    .from(growthRecommendations)
    .where(
      and(
        eq(growthRecommendations.projectId, projectId),
        inArray(growthRecommendations.status, eligibleStatuses),
        sql`(${growthRecommendations.status} <> 'accepted' OR NOT EXISTS (SELECT 1 FROM growth_actions AS priority_actions WHERE priority_actions.project_id = ${growthRecommendations.projectId} AND priority_actions.recommendation_id = ${growthRecommendations.id}))`,
        category === undefined
          ? undefined
          : eq(growthRecommendations.category, category),
        minPriorityScore === undefined
          ? undefined
          : gte(growthRecommendations.priorityScore, minPriorityScore),
        afterCursor,
      ),
    )
    .orderBy(
      desc(growthRecommendations.priorityScore),
      desc(createdAt),
      desc(recommendationId),
    )
    .limit(limit + 1);
}

async function listTargetsForRecommendations(
  projectId: string,
  recommendationIds: string[],
) {
  if (!recommendationIds.length) return [];
  const ranked = db
    .select({
      recommendationId: growthRecommendationTargets.recommendationId,
      targetType: growthRecommendationTargets.targetType,
      targetValue: growthRecommendationTargets.targetValue,
      rank: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${growthRecommendationTargets.recommendationId} ORDER BY ${growthRecommendationTargets.targetType}, ${growthRecommendationTargets.targetValue})`.as(
        "rank",
      ),
    })
    .from(growthRecommendationTargets)
    .where(
      and(
        eq(growthRecommendationTargets.projectId, projectId),
        inArray(
          growthRecommendationTargets.recommendationId,
          recommendationIds,
        ),
      ),
    )
    .as("ranked_recommendation_targets");
  return db
    .select()
    .from(ranked)
    .where(sql`${ranked.rank} <= 101`)
    .orderBy(ranked.recommendationId, sql`${ranked.rank}`);
}

async function listStepsForRecommendations(
  projectId: string,
  recommendationIds: string[],
) {
  if (!recommendationIds.length) return [];
  const ranked = db
    .select({
      recommendationId: growthRecommendationSteps.recommendationId,
      position: growthRecommendationSteps.position,
      content: growthRecommendationSteps.content,
      rank: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${growthRecommendationSteps.recommendationId} ORDER BY ${growthRecommendationSteps.position})`.as(
        "rank",
      ),
    })
    .from(growthRecommendationSteps)
    .where(
      and(
        eq(growthRecommendationSteps.projectId, projectId),
        inArray(growthRecommendationSteps.recommendationId, recommendationIds),
      ),
    )
    .as("ranked_recommendation_steps");
  return db
    .select()
    .from(ranked)
    .where(sql`${ranked.rank} <= 101`)
    .orderBy(ranked.recommendationId, sql`${ranked.rank}`);
}

export const GrowthPriorityRecommendationsRepository = {
  listRecommendationsPage,
  listTargetsForRecommendations,
  listStepsForRecommendations,
} as const;
