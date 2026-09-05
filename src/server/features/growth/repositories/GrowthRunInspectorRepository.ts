import { and, countDistinct, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  growthActions,
  growthInsights,
  growthRecommendations,
  growthRuns,
  growthSignals,
} from "@/db/schema";

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

export const GrowthRunInspectorRepository = { listRecentRuns } as const;
