import { AppError } from "@/server/lib/errors";
import { GrowthProjectSummaryRepository } from "../repositories/GrowthProjectSummaryRepository";
import { calendarDateInTimezone } from "./GrowthMeasurementFacts";
import { GrowthRunsService } from "./GrowthRunsService";
import {
  detectMeasurementsDue,
  MEASUREMENT_DUE_DETECTOR_VERSION,
} from "./MeasurementDueDetector";

const RUN_TYPE = "measurement_review" as const;
const CADENCE_PREFIX = "measurement-due-check:";
const SCAN_LIMIT = 51;
const SOURCE_TIMEZONE = "America/Los_Angeles";

type Run = Awaited<ReturnType<typeof GrowthRunsService.getRun>>;

function summary(run: Run) {
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

function isRun(run: Run, cadenceSlot: string) {
  return (
    run.runType === RUN_TYPE &&
    run.trigger === "manual" &&
    run.detectorVersion === MEASUREMENT_DUE_DETECTOR_VERSION &&
    run.cadenceSlot === cadenceSlot
  );
}

async function saved(run: Run, replayed: boolean) {
  const signals = await GrowthRunsService.listSignals(run.projectId, run.id);
  return {
    run: summary(run),
    replayed,
    dueCount: signals.filter(
      (signal) =>
        signal.signalType === "action_measurement_due" &&
        signal.entityType === "growth_action" &&
        signal.metric === "measurement_review_due" &&
        signal.evidenceKind === "manual_observation",
    ).length,
  };
}

async function runCheck(
  input: { projectId: string; requestKey: string },
  now = new Date(),
) {
  if (Number.isNaN(now.valueOf()))
    throw new AppError(
      "VALIDATION_ERROR",
      "Measurement due check clock is invalid",
    );
  const cadenceSlot = `${CADENCE_PREFIX}${input.requestKey}`;
  const existing = await GrowthRunsService.getRunBySlot(
    input.projectId,
    RUN_TYPE,
    cadenceSlot,
  );
  if (existing) {
    if (!isRun(existing, cadenceSlot))
      throw new AppError(
        "CONFLICT",
        "Measurement due request slot is occupied",
      );
    return saved(existing, true);
  }

  const capturedAt = now.toISOString();
  const sourceDate = calendarDateInTimezone(capturedAt, SOURCE_TIMEZONE);
  const claim = await GrowthRunsService.claimManualRun({
    projectId: input.projectId,
    runType: RUN_TYPE,
    cadenceSlot,
    periodStart: sourceDate,
    periodEnd: sourceDate,
    detectorVersion: MEASUREMENT_DUE_DETECTOR_VERSION,
  });
  if (!isRun(claim.run, cadenceSlot))
    throw new AppError("CONFLICT", "Measurement due request slot is occupied");
  if (!claim.claimed) return saved(claim.run, true);

  let candidates: Awaited<
    ReturnType<
      typeof GrowthProjectSummaryRepository.listActiveMeasurementCandidates
    >
  >;
  try {
    candidates =
      await GrowthProjectSummaryRepository.listActiveMeasurementCandidates(
        input.projectId,
        SCAN_LIMIT,
      );
  } catch {
    const terminal = await GrowthRunsService.failRun({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "MEASUREMENT_SCAN_FAILED",
      failureMessage: "Active Measurements could not be read.",
    });
    return saved(terminal, false);
  }
  if (candidates.length >= SCAN_LIMIT) {
    const terminal = await GrowthRunsService.completeRunWithErrors({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "MEASUREMENT_SCAN_OVERFLOW",
      failureMessage:
        "More than 50 active Measurements need a separate bounded review. No due Signals were recorded.",
    });
    return saved(terminal, false);
  }

  let result: ReturnType<typeof detectMeasurementsDue>;
  try {
    result = detectMeasurementsDue({
      projectId: input.projectId,
      runId: claim.run.id,
      capturedAt,
      candidates,
    });
  } catch {
    const terminal = await GrowthRunsService.failRun({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "MEASUREMENT_EVIDENCE_INVALID",
      failureMessage:
        "Saved Measurement scheduling facts are invalid. No due Signals were recorded.",
    });
    return saved(terminal, false);
  }

  try {
    let changedBeforeWriteCount = 0;
    for (const detection of result.detections) {
      const recorded = await GrowthRunsService.recordMeasurementDueSignal(
        detection.signal,
        {
          measurementPlanId: detection.measurementPlanId,
          actionId: detection.actionId,
          actionVersion: detection.actionVersion,
        },
      );
      if (!recorded) changedBeforeWriteCount += 1;
    }
    const skippedCount =
      result.skippedInconsistentCount + changedBeforeWriteCount;
    const terminal = skippedCount
      ? await GrowthRunsService.completeRunWithErrors({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "INCONSISTENT_MEASUREMENTS",
          failureMessage:
            "Some active Measurements no longer match their Action state and were skipped.",
        })
      : await GrowthRunsService.completeRun({
          projectId: input.projectId,
          runId: claim.run.id,
        });
    return saved(terminal, false);
  } catch {
    const durable = await GrowthRunsService.listSignals(
      input.projectId,
      claim.run.id,
    );
    const terminal = durable.length
      ? await GrowthRunsService.completeRunWithErrors({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "MEASUREMENT_SIGNAL_SAVE_PARTIAL",
          failureMessage:
            "Some due Measurement Signals could not be saved; completed Signals remain available.",
        })
      : await GrowthRunsService.failRun({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "MEASUREMENT_SIGNAL_SAVE_FAILED",
          failureMessage: "Due Measurement Signals could not be saved.",
        });
    return saved(terminal, false);
  }
}

export const GrowthMeasurementDueCheckService = { runCheck } as const;
