import {
  aliasedTable,
  and,
  countDistinct,
  desc,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import {
  growthActions,
  growthInsights,
  growthRecommendations,
  growthReports,
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
    ? sql`(${column})::timestamptz`
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

async function listRecentMonthlyCycles(
  projectId: string,
  childDetectorVersions: readonly string[],
  limit: number,
) {
  const startedAt = chronological(growthRuns.startedAt);
  const runId = codeUnitId(growthRuns.id);
  const recentRuns = db
    .select({
      id: growthRuns.id,
      projectId: growthRuns.projectId,
      trigger: growthRuns.trigger,
      status: growthRuns.status,
      periodStart: growthRuns.periodStart,
      periodEnd: growthRuns.periodEnd,
      startedAt: growthRuns.startedAt,
      completedAt: growthRuns.completedAt,
      failureCode: growthRuns.failureCode,
      failureMessage: growthRuns.failureMessage,
    })
    .from(growthRuns)
    .where(
      and(
        eq(growthRuns.projectId, projectId),
        eq(growthRuns.runType, "monthly_review"),
        eq(growthRuns.detectorVersion, "growth-monthly-review-v1"),
      ),
    )
    .orderBy(desc(startedAt), desc(runId))
    .limit(limit)
    .as("recent_growth_monthly_runs");
  const childRuns = aliasedTable(
    growthRuns,
    "monthly_priority_page_child_runs",
  );
  return db
    .select({
      parentId: recentRuns.id,
      parentTrigger: recentRuns.trigger,
      parentStatus: recentRuns.status,
      parentPeriodStart: recentRuns.periodStart,
      parentPeriodEnd: recentRuns.periodEnd,
      parentStartedAt: recentRuns.startedAt,
      parentCompletedAt: recentRuns.completedAt,
      parentFailureCode: recentRuns.failureCode,
      parentFailureMessage: recentRuns.failureMessage,
      childId: childRuns.id,
      childTrigger: childRuns.trigger,
      childStatus: childRuns.status,
      childPeriodStart: childRuns.periodStart,
      childPeriodEnd: childRuns.periodEnd,
      childStartedAt: childRuns.startedAt,
      childCompletedAt: childRuns.completedAt,
      childFailureCode: childRuns.failureCode,
      childFailureMessage: childRuns.failureMessage,
      reportStatus: growthReports.status,
      reportTimezone: growthReports.reportTimezone,
      reportDataCutoffAt: growthReports.dataCutoffAt,
      reportGeneratedAt: growthReports.generatedAt,
      reportCreatedByType: growthReports.createdByType,
      acceptedCount: sql<number>`cast(coalesce(sum(case when ${growthRecommendations.status} = 'accepted' then 1 else 0 end), 0) as integer)`,
      dismissedCount: sql<number>`cast(coalesce(sum(case when ${growthRecommendations.status} = 'dismissed' then 1 else 0 end), 0) as integer)`,
      duplicateDismissalCount: sql<number>`cast(coalesce(sum(case when ${growthRecommendations.status} = 'dismissed' and ${growthRecommendations.dismissalReason} = 'duplicate' then 1 else 0 end), 0) as integer)`,
      unresolvedCount: sql<number>`cast(coalesce(sum(case when ${growthRecommendations.status} in ('proposed', 'snoozed') then 1 else 0 end), 0) as integer)`,
      reconciledCount: sql<number>`cast(coalesce(sum(case when ${growthRecommendations.status} in ('merged', 'superseded') then 1 else 0 end), 0) as integer)`,
    })
    .from(recentRuns)
    .leftJoin(
      childRuns,
      and(
        eq(childRuns.projectId, recentRuns.projectId),
        eq(childRuns.runType, "manual_analysis"),
        eq(childRuns.trigger, recentRuns.trigger),
        inArray(childRuns.detectorVersion, [...childDetectorVersions]),
        eq(
          childRuns.cadenceSlot,
          sql`'priority-page-check:monthly_' || ${recentRuns.id}`,
        ),
      ),
    )
    .leftJoin(
      growthReports,
      and(
        eq(growthReports.projectId, recentRuns.projectId),
        eq(growthReports.reportType, "monthly"),
        eq(growthReports.periodStart, recentRuns.periodStart),
        eq(growthReports.periodEnd, recentRuns.periodEnd),
        eq(growthReports.version, 1),
      ),
    )
    .leftJoin(
      growthRecommendations,
      and(
        eq(growthRecommendations.projectId, childRuns.projectId),
        eq(growthRecommendations.runId, childRuns.id),
      ),
    )
    .groupBy(
      recentRuns.id,
      recentRuns.projectId,
      recentRuns.trigger,
      recentRuns.status,
      recentRuns.periodStart,
      recentRuns.periodEnd,
      recentRuns.startedAt,
      recentRuns.completedAt,
      recentRuns.failureCode,
      recentRuns.failureMessage,
      childRuns.id,
      childRuns.trigger,
      childRuns.status,
      childRuns.periodStart,
      childRuns.periodEnd,
      childRuns.startedAt,
      childRuns.completedAt,
      childRuns.failureCode,
      childRuns.failureMessage,
      growthReports.status,
      growthReports.reportTimezone,
      growthReports.dataCutoffAt,
      growthReports.generatedAt,
      growthReports.createdByType,
    )
    .orderBy(
      desc(chronological(recentRuns.startedAt)),
      desc(codeUnitId(recentRuns.id)),
    );
}

export const GrowthRunInspectorRepository = {
  listRecentRuns,
  listRecentCalibrationRecommendations,
  listRecentMonthlyCycles,
} as const;
