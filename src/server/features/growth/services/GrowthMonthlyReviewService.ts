import { AppError } from "@/server/lib/errors";
import {
  growthMonthlyReviewResponseSchema,
  type GrowthMonthlyReviewResponse,
  type RunGrowthMonthlyReviewRequest,
  type ScheduledGrowthMonthlyReviewInput,
} from "@/types/schemas/growth-monthly-review";
import { GrowthDueMeasurementsService } from "./GrowthDueMeasurementsService";
import { previousCompleteGrowthMonthlyPeriod } from "./GrowthMonthlyReportPeriod";
import { growthMonthlyReviewCoordinate } from "./GrowthMonthlySchedule";
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

type ScheduledSkip = { skipped: true; reason: "settings_changed" };
type Execution =
  | { trigger: "manual"; actorId: string; requestKey: string }
  | ({ trigger: "scheduled" } & ScheduledGrowthMonthlyReviewInput);

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
type Settings = Awaited<ReturnType<typeof GrowthSettingsService.getSettings>>;
type SchedulingSettings = Awaited<
  ReturnType<typeof GrowthSettingsService.getSchedulingSettings>
>;
type Period = { periodStart: string; periodEnd: string };

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

function isMonthlyReviewRun(
  run: StoredRun,
  execution: Execution,
  cadenceSlot: string,
) {
  return (
    run.runType === RUN_TYPE &&
    run.trigger === execution.trigger &&
    run.detectorVersion === GROWTH_MONTHLY_REVIEW_VERSION &&
    run.cadenceSlot === cadenceSlot &&
    (execution.trigger === "manual" ||
      (run.periodStart === execution.periodStart &&
        run.periodEnd === execution.periodEnd))
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

function validateScheduledCoordinate(execution: Execution) {
  if (execution.trigger !== "scheduled") return;
  const coordinate = growthMonthlyReviewCoordinate(
    execution.scheduledAt,
    execution.reportTimezone,
  );
  if (
    coordinate.cadenceSlot !== execution.cadenceSlot ||
    coordinate.periodStart !== execution.periodStart ||
    coordinate.periodEnd !== execution.periodEnd
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Scheduled monthly review coordinate is invalid",
    );
}

function scheduledSettingsChanged(
  execution: Execution,
  settings: Settings,
  schedulingSettings: SchedulingSettings,
) {
  return (
    execution.trigger === "scheduled" &&
    (!settings.persisted ||
      !settings.growthEnabled ||
      settings.reportCadence !== "monthly" ||
      settings.reportTimezone !== execution.reportTimezone ||
      schedulingSettings?.settingsRevision !== execution.settingsRevision)
  );
}

function reviewPeriod(execution: Execution, settings: Settings, now: Date) {
  return execution.trigger === "scheduled"
    ? { periodStart: execution.periodStart, periodEnd: execution.periodEnd }
    : previousCompleteGrowthMonthlyPeriod(
        now.toISOString(),
        settings.reportTimezone,
      );
}

async function claimReviewRun(input: {
  projectId: string;
  execution: Execution;
  existing: StoredRun | null;
  cadenceSlot: string;
  period: Period;
}) {
  if (input.existing) return { run: input.existing, claimed: false };
  const creation = {
    projectId: input.projectId,
    runType: RUN_TYPE,
    cadenceSlot: input.cadenceSlot,
    ...input.period,
    detectorVersion: GROWTH_MONTHLY_REVIEW_VERSION,
  };
  return input.execution.trigger === "scheduled"
    ? GrowthRunsService.claimScheduledRun({
        ...creation,
        settingsRevision: input.execution.settingsRevision,
      })
    : GrowthRunsService.claimManualRun(creation);
}

function runPriorityPagePhase(
  projectId: string,
  runId: string,
  execution: Execution,
) {
  const input = { projectId, requestKey: `monthly_${runId}` };
  return execution.trigger === "scheduled"
    ? GrowthPriorityPageCheckService.runScheduledCheck({
        ...input,
        settingsRevision: execution.settingsRevision,
      })
    : GrowthPriorityPageCheckService.runCheck(input);
}

function buildMonthlyReport(
  projectId: string,
  expectation: {
    projectId: string;
    periodStart: string;
    periodEnd: string;
    reportTimezone: string;
  },
  execution: Execution,
  now: Date,
) {
  return execution.trigger === "scheduled"
    ? GrowthMonthlyReportsService.buildScheduledGrowthMonthlyReport(
        projectId,
        expectation,
        now,
      )
    : GrowthMonthlyReportsService.buildGrowthMonthlyReport(
        projectId,
        execution.actorId,
        expectation,
        now,
      );
}

async function runMonthlyReview(
  projectId: string,
  actorId: string,
  request: RunGrowthMonthlyReviewRequest,
  now = new Date(),
): Promise<GrowthMonthlyReviewResponse> {
  const result = await executeMonthlyReview(
    projectId,
    { trigger: "manual", actorId, requestKey: request.requestKey },
    now,
  );
  if ("skipped" in result)
    throw new AppError("INTERNAL_ERROR", "Manual monthly review was skipped");
  return result;
}

async function runScheduledMonthlyReview(
  input: ScheduledGrowthMonthlyReviewInput,
  now = new Date(),
): Promise<GrowthMonthlyReviewResponse | ScheduledSkip> {
  return executeMonthlyReview(
    input.projectId,
    { trigger: "scheduled", ...input },
    now,
  );
}

async function executeMonthlyReview(
  projectId: string,
  execution: Execution,
  now: Date,
): Promise<GrowthMonthlyReviewResponse | ScheduledSkip> {
  if (Number.isNaN(now.valueOf()))
    throw new AppError("VALIDATION_ERROR", "Monthly review clock is invalid");

  validateScheduledCoordinate(execution);

  const cadenceSlot =
    execution.trigger === "manual"
      ? `${CADENCE_SLOT_PREFIX}${execution.requestKey}`
      : execution.cadenceSlot;
  const existing = await GrowthRunsService.getRunBySlot(
    projectId,
    RUN_TYPE,
    cadenceSlot,
  );
  if (existing) {
    if (!isMonthlyReviewRun(existing, execution, cadenceSlot)) conflict();
    // Manual requests are exact replay only. A scheduled Workflow may re-enter
    // after a persisted step retry, so its compatible running Run resumes the
    // idempotent child phases below.
    if (execution.trigger === "manual" || existing.status !== "running")
      return replay(existing);
  }

  const settings = await GrowthSettingsService.getSettings(projectId);
  const schedulingSettings =
    execution.trigger === "scheduled"
      ? await GrowthSettingsService.getSchedulingSettings(projectId)
      : null;
  const settingsChanged = scheduledSettingsChanged(
    execution,
    settings,
    schedulingSettings,
  );
  if (existing && settingsChanged) {
    const terminal = await GrowthRunsService.failRun({
      projectId,
      runId: existing.id,
      failureCode: FAILED_CODE,
      failureMessage: FAILED_MESSAGE,
    });
    return replay(terminal);
  }
  if (!existing && settingsChanged)
    return { skipped: true, reason: "settings_changed" };
  const period = reviewPeriod(execution, settings, now);
  const expectation = {
    projectId,
    ...period,
    reportTimezone:
      execution.trigger === "scheduled"
        ? execution.reportTimezone
        : settings.reportTimezone,
  };
  const claim = await claimReviewRun({
    projectId,
    execution,
    existing,
    cadenceSlot,
    period,
  });
  if (!claim.run) return { skipped: true, reason: "settings_changed" };
  if (!isMonthlyReviewRun(claim.run, execution, cadenceSlot)) conflict();
  if (
    !claim.claimed &&
    (execution.trigger === "manual" || claim.run.status !== "running")
  )
    return replay(claim.run);

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
    check = await runPriorityPagePhase(projectId, claim.run.id, execution);
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
      const built = await buildMonthlyReport(
        projectId,
        expectation,
        execution,
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

export const GrowthMonthlyReviewService = {
  runMonthlyReview,
  runScheduledMonthlyReview,
} as const;
