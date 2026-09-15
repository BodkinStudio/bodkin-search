import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import {
  growthActions,
  growthMeasurementMetrics,
  growthMeasurementPlans,
  growthMeasurementResults,
} from "@/db/schema";
import type { GrowthMeasurementsRequest } from "@/types/schemas/growth-measurements-list";

function codeUnitId(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column} COLLATE "C"`
    : sql`${column} COLLATE BINARY`;
}

/** Normalize SQLite's UTC current_timestamp text before cursor comparison. */
function chronological(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column}`
    : sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${column})`;
}

async function listMeasurementPlansPage(input: GrowthMeasurementsRequest) {
  const planId = codeUnitId(growthMeasurementPlans.id);
  const createdAt = chronological(growthMeasurementPlans.createdAt);
  const afterCursor = input.cursor
    ? or(
        lt(createdAt, input.cursor.createdAt),
        and(eq(createdAt, input.cursor.createdAt), lt(planId, input.cursor.id)),
      )
    : undefined;
  return db
    .select({
      id: growthMeasurementPlans.id,
      actionId: growthMeasurementPlans.actionId,
      status: growthMeasurementPlans.status,
      actionVersion: growthMeasurementPlans.actionVersion,
      anchorAt: growthMeasurementPlans.anchorAt,
      anchorDate: growthMeasurementPlans.anchorDate,
      reportTimezone: growthMeasurementPlans.reportTimezone,
      baselineStart: growthMeasurementPlans.baselineStart,
      baselineEnd: growthMeasurementPlans.baselineEnd,
      cooldownEnd: growthMeasurementPlans.cooldownEnd,
      measurementStart: growthMeasurementPlans.measurementStart,
      measurementEnd: growthMeasurementPlans.measurementEnd,
      longMeasurementEnd: growthMeasurementPlans.longMeasurementEnd,
      comparisonMode: growthMeasurementPlans.comparisonMode,
      completedAt: growthMeasurementPlans.completedAt,
      createdAt: growthMeasurementPlans.createdAt,
      actionTitle: growthActions.title,
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
    .where(
      and(
        eq(growthMeasurementPlans.projectId, input.projectId),
        input.statuses
          ? inArray(growthMeasurementPlans.status, input.statuses)
          : undefined,
        afterCursor,
      ),
    )
    .orderBy(desc(createdAt), desc(planId))
    .limit(input.limit + 1);
}

async function listMetricsForMeasurementPlans(
  projectId: string,
  measurementPlanIds: string[],
) {
  if (!measurementPlanIds.length) return [];
  const metricId = codeUnitId(growthMeasurementMetrics.id);
  const ranked = db
    .select({
      measurementPlanId: growthMeasurementMetrics.measurementPlanId,
      isPrimary: growthMeasurementMetrics.isPrimary,
      rank: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${growthMeasurementMetrics.measurementPlanId} ORDER BY ${metricId})`.as(
        "rank",
      ),
    })
    .from(growthMeasurementMetrics)
    .where(
      and(
        eq(growthMeasurementMetrics.projectId, projectId),
        inArray(growthMeasurementMetrics.measurementPlanId, measurementPlanIds),
      ),
    )
    .as("ranked_growth_measurement_metrics");
  return db
    .select()
    .from(ranked)
    .where(sql`${ranked.rank} <= 51`)
    .orderBy(ranked.measurementPlanId, sql`${ranked.rank}`);
}

async function listResultsForMeasurementPlans(
  projectId: string,
  measurementPlanIds: string[],
) {
  if (!measurementPlanIds.length) return [];
  return db
    .select({
      measurementPlanId: growthMeasurementResults.measurementPlanId,
      outcome: growthMeasurementResults.outcome,
      confidence: growthMeasurementResults.confidence,
      summary: growthMeasurementResults.summary,
      evaluatedAt: growthMeasurementResults.evaluatedAt,
    })
    .from(growthMeasurementResults)
    .where(
      and(
        eq(growthMeasurementResults.projectId, projectId),
        inArray(growthMeasurementResults.measurementPlanId, measurementPlanIds),
      ),
    )
    .limit(measurementPlanIds.length + 1);
}

export const GrowthMeasurementsReadRepository = {
  listMeasurementPlansPage,
  listMetricsForMeasurementPlans,
  listResultsForMeasurementPlans,
} as const;
