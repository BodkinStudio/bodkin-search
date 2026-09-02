import { AppError } from "@/server/lib/errors";
import {
  growthMonthlyReviewResponseSchema,
  type GrowthMonthlyReviewResponse,
  type RunGrowthMonthlyReviewRequest,
} from "@/types/schemas/growth-monthly-review";
import { GrowthDueMeasurementsService } from "./GrowthDueMeasurementsService";
import { previousCompleteGrowthMonthlyPeriod } from "./GrowthMonthlyReportPeriod";
import { GrowthMonthlyReportsService } from "./GrowthMonthlyReportsService";
import { GrowthPriorityPageCheckService } from "./GrowthPriorityPageCheckService";
import { GrowthRunsService } from "./GrowthRunsService";
import { GrowthSettingsService } from "./GrowthSettingsService";

export const GROWTH_MONTHLY_REVIEW_VERSION = "growth-monthly-review-v1";
const RUN_TYPE = "monthly_review" as const;
const CADENCE_SLOT_PREFIX = "monthly-review:";
const PARTIAL_CODE = "MONTHLY_REVIEW_PARTIAL";
const PARTIAL_MESSAGE =
  "Monthly review completed with one or more incomplete phases.";
const FAILED_CODE = "MONTHLY_REVIEW_FAILED";
const FAILED_MESSAGE = "Monthly review could not complete any phase.";

type StoredRun = NonNullable<
  Awaited<ReturnType<typeof GrowthRunsService.getRunBySlot>>
>;
type CheckResult = Awaited<
  ReturnType<typeof GrowthPriorityPageCheckService.runCheck>
>;
type InitialMonthlyReviewResponse = Extract<
  GrowthMonthlyReviewResponse,
  { replayed: false }
>;

function runSummary(run: StoredRun) {
  return {
    id: run.id,
    status: run.status,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    failureCode: run.failureCode,
    failureMessage: run.failureMessage,
  };
}

function checkRunSummary(run: CheckResult["run"]) {
  return {
    id: run.id,
    status: run.status,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };
}

function isMonthlyReviewRun(run: StoredRun, cadenceSlot: string) {
  return (
    run.runType === RUN_TYPE &&
    run.trigger === "manual" &&
    run.detectorVersion === GROWTH_MONTHLY_REVIEW_VERSION &&
    run.cadenceSlot === cadenceSlot
  );
}

function replay(run: StoredRun): GrowthMonthlyReviewResponse {
  return growthMonthlyReviewResponseSchema.parse({
    replayed: true,
    run: runSummary(run),
  });
}

function conflict(): never {
  throw new AppError("CONFLICT", "Monthly review request slot is occupied");
}

function exactReportCoordinate(
  report: Awaited<
    ReturnType<typeof GrowthMonthlyReportsService.buildGrowthMonthlyReport>
  >,
  expected: {
    periodStart: string;
    periodEnd: string;
    reportTimezone: string;
  },
) {
  return (
    report.periodStart === expected.periodStart &&
    report.periodEnd === expected.periodEnd &&
    report.reportTimezone === expected.reportTimezone
  );
}

async function runMonthlyReview(
  projectId: string,
  actorId: string,
  request: RunGrowthMonthlyReviewRequest,
  now = new Date(),
): Promise<GrowthMonthlyReviewResponse> {
  if (Number.isNaN(now.valueOf()))
    throw new AppError("VALIDATION_ERROR", "Monthly review clock is invalid");

  const cadenceSlot = `${CADENCE_SLOT_PREFIX}${request.requestKey}`;
  const existing = await GrowthRunsService.getRunBySlot(
    projectId,
    RUN_TYPE,
    cadenceSlot,
  );
  if (existing) {
    if (!isMonthlyReviewRun(existing, cadenceSlot)) conflict();
    return replay(existing);
  }

  const settings = await GrowthSettingsService.getSettings(projectId);
  const period = previousCompleteGrowthMonthlyPeriod(
    now.toISOString(),
    settings.reportTimezone,
  );
  const expectation = {
    projectId,
    ...period,
    reportTimezone: settings.reportTimezone,
  };
  const claim = await GrowthRunsService.claimManualRun({
    projectId,
    runType: RUN_TYPE,
    cadenceSlot,
    ...period,
    detectorVersion: GROWTH_MONTHLY_REVIEW_VERSION,
  });
  if (!isMonthlyReviewRun(claim.run, cadenceSlot)) conflict();
  if (!claim.claimed) return replay(claim.run);

  const warnings: InitialMonthlyReviewResponse["warnings"] = [];
  let usefulPhases = 0;
  let check: CheckResult | null = null;
  let dueMeasurements: Awaited<
    ReturnType<typeof GrowthDueMeasurementsService.getDueMeasurements>
  > | null = null;
  let report: Awaited<
    ReturnType<typeof GrowthMonthlyReportsService.buildGrowthMonthlyReport>
  > | null = null;

  try {
    check = await GrowthPriorityPageCheckService.runCheck({
      projectId,
      requestKey: `monthly_${claim.run.id}`,
    });
    if (check.run.status === "running") {
      warnings.push("PRIORITY_PAGE_CHECK_RUNNING");
    } else if (check.run.status === "completed_with_errors") {
      usefulPhases += 1;
      warnings.push("PRIORITY_PAGE_CHECK_PARTIAL");
    } else if (check.run.status === "completed") {
      usefulPhases += 1;
    } else {
      warnings.push("PRIORITY_PAGE_CHECK_FAILED");
    }
  } catch {
    warnings.push("PRIORITY_PAGE_CHECK_FAILED");
  }

  // A running child may still be mutating detector facts, so freezing a report
  // behind it would make the envelope's phase order untrue.
  if (!check || check.run.status !== "running") {
    try {
      dueMeasurements = await GrowthDueMeasurementsService.getDueMeasurements(
        projectId,
        {
          now,
        },
      );
      usefulPhases += 1;
      if (dueMeasurements.scanState === "overflow")
        warnings.push("DUE_MEASUREMENTS_OVERFLOW");
    } catch {
      warnings.push("DUE_MEASUREMENTS_FAILED");
    }

    try {
      const built = await GrowthMonthlyReportsService.buildGrowthMonthlyReport(
        projectId,
        actorId,
        expectation,
        now,
      );
      if (
        built.state === "ready" ||
        !exactReportCoordinate(built, expectation)
      ) {
        warnings.push("MONTHLY_REPORT_DRIFT");
      } else {
        usefulPhases += 1;
        report = built;
      }
    } catch {
      warnings.push("MONTHLY_REPORT_FAILED");
    }
  }

  let terminal: StoredRun;
  try {
    if (warnings.length === 0) {
      terminal = await GrowthRunsService.completeRun({
        projectId,
        runId: claim.run.id,
      });
    } else if (usefulPhases > 0) {
      terminal = await GrowthRunsService.completeRunWithErrors({
        projectId,
        runId: claim.run.id,
        failureCode: PARTIAL_CODE,
        failureMessage: PARTIAL_MESSAGE,
      });
    } else {
      terminal = await GrowthRunsService.failRun({
        projectId,
        runId: claim.run.id,
        failureCode: FAILED_CODE,
        failureMessage: FAILED_MESSAGE,
      });
    }
  } catch {
    throw new AppError("INTERNAL_ERROR", "Monthly review finalization failed");
  }

  return growthMonthlyReviewResponseSchema.parse({
    replayed: false,
    consistency: "current_not_snapshot",
    run: runSummary(terminal),
    check:
      check == null
        ? null
        : { replayed: check.replayed, run: checkRunSummary(check.run) },
    dueMeasurements,
    report,
    warnings,
  });
}

export const GrowthMonthlyReviewService = { runMonthlyReview } as const;
