import { AppError } from "@/server/lib/errors";
import {
  GROWTH_OVERVIEW_ACTIVE_ACTION_STATUSES,
  growthOperatingOverviewDtoSchema,
  type GrowthOperatingOverviewDto,
} from "@/types/schemas/growth-operating-overview";
import { GrowthActionsReadService } from "./GrowthActionsReadService";
import { GrowthDueMeasurementsService } from "./GrowthDueMeasurementsService";
import { GrowthMeasurementsReadService } from "./GrowthMeasurementsReadService";
import { GrowthMonthlyReportsService } from "./GrowthMonthlyReportsService";
import { GrowthOpportunitiesService } from "./GrowthOpportunitiesService";

const PAGE_LIMIT = 50;

function actionCounts() {
  return {
    approved: 0,
    ready: 0,
    in_progress: 0,
    blocked: 0,
    implemented: 0,
    measuring: 0,
  };
}

function outcomeCounts() {
  return {
    strong_positive: 0,
    positive: 0,
    inconclusive: 0,
    neutral: 0,
    negative: 0,
    strong_negative: 0,
    not_measurable: 0,
  };
}

async function getOperatingOverview(
  projectId: string,
  options: { now?: Date } = {},
): Promise<GrowthOperatingOverviewDto> {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.valueOf()))
    throw new AppError("VALIDATION_ERROR", "Overview clock is invalid");

  const [opportunities, actions, due, measurements, monthly] =
    await Promise.all([
      GrowthOpportunitiesService.listOpportunities(projectId),
      GrowthActionsReadService.listActions({
        projectId,
        statuses: [...GROWTH_OVERVIEW_ACTIVE_ACTION_STATUSES],
        limit: PAGE_LIMIT,
      }),
      GrowthDueMeasurementsService.getDueMeasurements(projectId, { now }),
      GrowthMeasurementsReadService.listMeasurements({
        projectId,
        statuses: ["completed"],
        limit: PAGE_LIMIT,
      }),
      GrowthMonthlyReportsService.getGrowthMonthlyReport(
        projectId,
        { projectId },
        now,
      ),
    ]);

  const byStatus = actionCounts();
  for (const action of actions.actions) {
    if (action.status === "evaluated" || action.status === "cancelled")
      throw new AppError(
        "INTERNAL_ERROR",
        "Active Work read returned a terminal Action",
      );
    byStatus[action.status] += 1;
  }

  const byOutcome = outcomeCounts();
  const alignedResults = measurements.measurements.filter(
    (measurement) =>
      measurement.actionLifecycle === "aligned" && measurement.result !== null,
  );
  for (const measurement of alignedResults)
    if (measurement.result) byOutcome[measurement.result.outcome] += 1;

  return growthOperatingOverviewDtoSchema.parse({
    asOf: now.toISOString(),
    consistency: "current_not_snapshot",
    opportunities: {
      count: opportunities.recommendations.length,
      hasMore: opportunities.hasMore,
    },
    activeWork: {
      count: actions.actions.length,
      hasMore: actions.hasMore,
      byStatus,
    },
    dueMeasurements:
      due.scanState === "overflow"
        ? { count: null, hasMore: true, scanState: "overflow" }
        : {
            count: due.items.length,
            hasMore: due.hasMore,
            scanState: "complete",
          },
    evaluatedMeasurements: {
      count: alignedResults.length,
      sourceHasMore: measurements.hasMore,
      inconsistentCount: measurements.measurements.filter(
        (measurement) => measurement.actionLifecycle === "inconsistent",
      ).length,
      byOutcome,
    },
    monthlySummary: {
      state: monthly.state === "report" ? monthly.report.status : monthly.state,
      periodStart: monthly.periodStart,
      periodEnd: monthly.periodEnd,
    },
  });
}

export const GrowthOperatingOverviewService = {
  getOperatingOverview,
} as const;
