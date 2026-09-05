import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import {
  type CompleteGrowthRunInput,
  type CompleteGrowthRunWithErrorsInput,
  type CreateManualGrowthRunInput,
  type RecordGrowthSignalInput,
} from "@/types/schemas/growth";
import { GrowthRunsRepository } from "../repositories/GrowthRunsRepository";

function sameManualCreationInput(
  row: Awaited<ReturnType<typeof GrowthRunsRepository.getRunBySlot>>,
  input: CreateManualGrowthRunInput,
) {
  return (
    row?.trigger === "manual" &&
    row.periodStart === input.periodStart &&
    row.periodEnd === input.periodEnd &&
    row.detectorVersion === input.detectorVersion &&
    row.analysisVersion === (input.analysisVersion ?? null) &&
    row.model === (input.model ?? null) &&
    row.promptVersion === (input.promptVersion ?? null)
  );
}

function sameSignalFact(
  row: Awaited<ReturnType<typeof GrowthRunsRepository.getSignal>>,
  input: RecordGrowthSignalInput,
) {
  return (
    row?.runId === input.runId &&
    row.signalType === input.signalType &&
    row.entityType === input.entityType &&
    row.entityRef === input.entityRef &&
    row.metric === input.metric &&
    row.severity === input.severity &&
    row.confidence === input.confidence &&
    row.periodStart === input.periodStart &&
    row.periodEnd === input.periodEnd &&
    row.baselineValue === input.baselineValue &&
    row.currentValue === input.currentValue &&
    row.deltaValue === input.deltaValue &&
    row.deltaPercent === (input.deltaPercent ?? null) &&
    row.evidenceKind === input.evidenceKind &&
    row.evidenceRef === input.evidenceRef &&
    row.capturedAt === input.capturedAt
  );
}

async function createManualRun(input: CreateManualGrowthRunInput) {
  if (!(await GrowthRunsRepository.projectExists(input.projectId))) {
    throw new AppError("NOT_FOUND", "Growth project not found");
  }
  const inserted = await GrowthRunsRepository.tryCreateManualRun(
    input,
    crypto.randomUUID(),
  );
  if (inserted) {
    const row = await GrowthRunsRepository.getRunBySlot(
      input.projectId,
      input.runType,
      input.cadenceSlot,
    );
    if (row) return row;
    throw new Error("Created Growth run could not be read");
  }
  const existing = await GrowthRunsRepository.getRunBySlot(
    input.projectId,
    input.runType,
    input.cadenceSlot,
  );
  if (sameManualCreationInput(existing, input)) return existing;
  throw new AppError("CONFLICT", "Growth run cadence slot is already occupied");
}

/**
 * Atomically claims a manual request identity. Only the caller receiving
 * `claimed: true` may collect provider data; all other callers replay storage.
 */
async function claimManualRun(input: CreateManualGrowthRunInput) {
  if (!(await GrowthRunsRepository.projectExists(input.projectId))) {
    throw new AppError("NOT_FOUND", "Growth project not found");
  }
  const inserted = await GrowthRunsRepository.tryCreateManualRun(
    input,
    crypto.randomUUID(),
  );
  const run = await GrowthRunsRepository.getRunBySlot(
    input.projectId,
    input.runType,
    input.cadenceSlot,
  );
  if (!run) throw new Error("Claimed Growth run could not be read");
  // The slot is the caller's retry identity. A later retry can cross a source
  // date boundary, so it must replay this immutable run rather than comparing
  // newly-derived windows and accidentally recollecting.
  return { run, claimed: inserted };
}

/** Atomically claims one scheduler-owned cadence identity. */
async function claimScheduledRun(
  input: CreateManualGrowthRunInput & { settingsRevision: number },
) {
  if (!(await GrowthRunsRepository.projectExists(input.projectId))) {
    throw new AppError("NOT_FOUND", "Growth project not found");
  }
  const inserted = await GrowthRunsRepository.tryCreateScheduledRun(
    input,
    crypto.randomUUID(),
    input.settingsRevision,
  );
  const run = await GrowthRunsRepository.getRunBySlot(
    input.projectId,
    input.runType,
    input.cadenceSlot,
  );
  if (!run) return { run: null, claimed: false };
  return { run, claimed: inserted };
}

async function getRun(projectId: string, runId: string) {
  const row = await GrowthRunsRepository.getRun(projectId, runId);
  if (!row) throw new AppError("NOT_FOUND", "Growth run not found");
  return row;
}

function getRunBySlot(
  projectId: string,
  runType: CreateManualGrowthRunInput["runType"],
  cadenceSlot: string,
) {
  return GrowthRunsRepository.getRunBySlot(projectId, runType, cadenceSlot);
}

function listRuns(projectId: string) {
  return GrowthRunsRepository.listRuns(projectId);
}

function listRecentRuns(projectId: string, limit: number) {
  return GrowthRunsRepository.listRecentRuns(projectId, limit);
}

function listRecentRunsForDetector(
  projectId: string,
  runType: CreateManualGrowthRunInput["runType"],
  detectorVersion: string,
  cadenceSlotPrefix: string,
  limit: number,
) {
  return GrowthRunsRepository.listRecentRunsForDetector(
    projectId,
    runType,
    detectorVersion,
    cadenceSlotPrefix,
    limit,
  );
}

async function listSignals(projectId: string, runId: string) {
  if (!(await GrowthRunsRepository.getRun(projectId, runId))) {
    throw new AppError("NOT_FOUND", "Growth run not found");
  }
  return GrowthRunsRepository.listSignals(projectId, runId);
}

async function transition(
  input: CompleteGrowthRunInput,
  status: "completed" | "completed_with_errors" | "failed",
) {
  const row = await GrowthRunsRepository.transitionRunningRun({
    ...input,
    status,
  });
  if (row) return row;
  if (!(await GrowthRunsRepository.getRun(input.projectId, input.runId))) {
    throw new AppError("NOT_FOUND", "Growth run not found");
  }
  throw new AppError("CONFLICT", "Growth run is no longer running");
}

function completeRun(input: CompleteGrowthRunInput) {
  return transition(input, "completed");
}
async function setAnalysisVersion(input: {
  projectId: string;
  runId: string;
  analysisVersion: string;
}) {
  const row = await GrowthRunsRepository.setAnalysisVersionWhileRunning(input);
  if (row) return row;
  if (!(await GrowthRunsRepository.getRun(input.projectId, input.runId)))
    throw new AppError("NOT_FOUND", "Growth run not found");
  throw new AppError("CONFLICT", "Growth run is no longer running");
}
function completeRunWithErrors(input: CompleteGrowthRunWithErrorsInput) {
  return transition(input, "completed_with_errors");
}
function failRun(input: CompleteGrowthRunWithErrorsInput) {
  return transition(input, "failed");
}

async function recordSignal(input: RecordGrowthSignalInput) {
  const id = await signalId(input);
  await GrowthRunsRepository.tryRecordSignalWhileRunIsRunning(input, id);
  const row = await GrowthRunsRepository.getSignal(input.projectId, id);
  if (sameSignalFact(row, input)) return row;
  if (row)
    throw new AppError(
      "CONFLICT",
      "Growth Signal identity conflicts with an immutable fact",
    );
  if (!(await GrowthRunsRepository.getRun(input.projectId, input.runId))) {
    throw new AppError("NOT_FOUND", "Growth run not found");
  }
  throw new AppError(
    "CONFLICT",
    "Growth Signals can only be recorded for a running run",
  );
}

async function signalId(input: RecordGrowthSignalInput) {
  return (
    await sha256Hex(
      JSON.stringify([
        input.projectId,
        input.runId,
        input.signalType,
        input.entityType,
        input.entityRef,
        input.metric,
        input.periodStart,
        input.periodEnd,
      ]),
    )
  ).slice(0, 36);
}

async function recordMeasurementDueSignal(
  input: RecordGrowthSignalInput,
  eligibility: {
    measurementPlanId: string;
    actionId: string;
    actionVersion: number;
  },
) {
  if (
    input.signalType !== "action_measurement_due" ||
    input.entityType !== "growth_action" ||
    input.entityRef !== eligibility.actionId ||
    input.metric !== "measurement_review_due" ||
    input.evidenceKind !== "manual_observation"
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Measurement due Signal coordinates are invalid",
    );
  const id = await signalId(input);
  await GrowthRunsRepository.tryRecordMeasurementDueSignalWhileEligible(
    input,
    id,
    eligibility,
  );
  const row = await GrowthRunsRepository.getSignal(input.projectId, id);
  if (sameSignalFact(row, input)) return row;
  if (row)
    throw new AppError(
      "CONFLICT",
      "Growth Signal identity conflicts with an immutable fact",
    );
  const run = await GrowthRunsRepository.getRun(input.projectId, input.runId);
  if (!run) throw new AppError("NOT_FOUND", "Growth run not found");
  if (run.status !== "running")
    throw new AppError(
      "CONFLICT",
      "Growth Signals can only be recorded for a running run",
    );
  return null;
}

export const GrowthRunsService = {
  createManualRun,
  claimManualRun,
  claimScheduledRun,
  getRun,
  getRunBySlot,
  listRuns,
  listRecentRuns,
  listRecentRunsForDetector,
  completeRun,
  setAnalysisVersion,
  completeRunWithErrors,
  failRun,
  recordSignal,
  recordMeasurementDueSignal,
  listSignals,
} as const;
