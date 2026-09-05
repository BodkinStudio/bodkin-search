import { and, countDistinct, desc, eq, inArray, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import {
  growthActions,
  growthInsights,
  growthRecommendations,
  growthRuns,
  growthSignals,
} from "@/db/schema";

function codeUnitId(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column} COLLATE "C"`
    : sql`${column} COLLATE BINARY`;
}

function chronological(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column}`
    : sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${column})`;
}

async function listRecentRuns(projectId: string, limit: number) {
  const recentRuns = db
    .select({
      id: growthRuns.id,
      projectId: growthRuns.projectId,
      runType: growthRuns.runType,
      trigger: growthRuns.trigger,
      status: growthRuns.status,
      periodStart: growthRuns.periodStart,
      periodEnd: growthRuns.periodEnd,
      startedAt: growthRuns.startedAt,
      completedAt: growthRuns.completedAt,
      detectorVersion: growthRuns.detectorVersion,
      analysisVersion: growthRuns.analysisVersion,
      providerCostMinor: growthRuns.providerCostMinor,
      failureCode: growthRuns.failureCode,
      failureMessage: growthRuns.failureMessage,
    })
    .from(growthRuns)
    .where(eq(growthRuns.projectId, projectId))
    .orderBy(desc(growthRuns.startedAt), desc(growthRuns.id))
    .limit(limit)
    .as("recent_growth_runs");

  return db
    .select({
      id: recentRuns.id,
      runType: recentRuns.runType,
      trigger: recentRuns.trigger,
      status: recentRuns.status,
      periodStart: recentRuns.periodStart,
      periodEnd: recentRuns.periodEnd,
      startedAt: recentRuns.startedAt,
      completedAt: recentRuns.completedAt,
      detectorVersion: recentRuns.detectorVersion,
      analysisVersion: recentRuns.analysisVersion,
      providerCostMinor: recentRuns.providerCostMinor,
      failureCode: recentRuns.failureCode,
      failureMessage: recentRuns.failureMessage,
      signalCount: countDistinct(growthSignals.id),
      insightCount: countDistinct(growthInsights.id),
      recommendationCount: countDistinct(growthRecommendations.id),
      linkedActionCount: countDistinct(growthActions.id),
    })
    .from(recentRuns)
    .leftJoin(
      growthSignals,
      and(
        eq(growthSignals.projectId, recentRuns.projectId),
        eq(growthSignals.runId, recentRuns.id),
      ),
    )
    .leftJoin(
      growthInsights,
      and(
        eq(growthInsights.projectId, recentRuns.projectId),
        eq(growthInsights.runId, recentRuns.id),
      ),
    )
    .leftJoin(
      growthRecommendations,
      and(
        eq(growthRecommendations.projectId, recentRuns.projectId),
        eq(growthRecommendations.runId, recentRuns.id),
      ),
    )
    .leftJoin(
      growthActions,
      and(
        eq(growthActions.projectId, growthRecommendations.projectId),
        eq(growthActions.recommendationId, growthRecommendations.id),
      ),
    )
    .groupBy(
      recentRuns.id,
      recentRuns.projectId,
      recentRuns.runType,
      recentRuns.trigger,
      recentRuns.status,
      recentRuns.periodStart,
      recentRuns.periodEnd,
      recentRuns.startedAt,
      recentRuns.completedAt,
      recentRuns.detectorVersion,
      recentRuns.analysisVersion,
      recentRuns.providerCostMinor,
      recentRuns.failureCode,
      recentRuns.failureMessage,
    )
    .orderBy(desc(recentRuns.startedAt), desc(recentRuns.id));
}

async function listRecentCalibrationRecommendations(
  projectId: string,
  detectorVersions: readonly string[],
  limit: number,
) {
  const createdAt = chronological(growthRecommendations.createdAt);
  const recommendationId = codeUnitId(growthRecommendations.id);
  return db
    .select({
      id: growthRecommendations.id,
      detectorVersion: growthRuns.detectorVersion,
      status: growthRecommendations.status,
      dismissalReason: growthRecommendations.dismissalReason,
    })
    .from(growthRecommendations)
    .innerJoin(
      growthRuns,
      and(
        eq(growthRuns.projectId, growthRecommendations.projectId),
        eq(growthRuns.id, growthRecommendations.runId),
      ),
    )
    .where(
      and(
        eq(growthRecommendations.projectId, projectId),
        eq(growthRecommendations.category, "investigation"),
        inArray(growthRuns.detectorVersion, [...detectorVersions]),
      ),
    )
    .orderBy(desc(createdAt), desc(recommendationId))
    .limit(limit);
}

export const GrowthRunInspectorRepository = {
  listRecentRuns,
  listRecentCalibrationRecommendations,
} as const;
