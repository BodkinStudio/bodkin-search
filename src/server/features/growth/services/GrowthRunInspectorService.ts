import { AppError } from "@/server/lib/errors";
import {
  GROWTH_CALIBRATION_DISMISSAL_REASONS,
  GROWTH_SIGNAL_QUALITY_FALSE_POSITIVE_REASONS,
  growthRunInspectorDtoSchema,
  type GrowthRunInspectorDto,
} from "@/types/schemas/growth-run-inspector";
import { GrowthRunInspectorRepository } from "../repositories/GrowthRunInspectorRepository";
import { NEW_CRITICAL_AUDIT_ISSUE_DETECTOR_VERSION } from "./NewCriticalAuditIssueDetector";
import { PERSISTENT_TRACKED_RANK_DROP_DETECTOR_VERSION } from "./PersistentTrackedRankDropDetector";
import { PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSIONS } from "./PriorityPageClickDeclineDetector";

const LIMIT = 20;
const CALIBRATION_LIMIT = 200;
const MONTHLY_CYCLE_LIMIT = 6;
const CALIBRATION_DETECTOR_VERSIONS = [
  ...PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSIONS,
  PERSISTENT_TRACKED_RANK_DROP_DETECTOR_VERSION,
  NEW_CRITICAL_AUDIT_ISSUE_DETECTOR_VERSION,
] as const;
const SIGNAL_QUALITY_FALSE_POSITIVE_REASONS = new Set<string>(
  GROWTH_SIGNAL_QUALITY_FALSE_POSITIVE_REASONS,
);
type CalibrationRow = Awaited<
  ReturnType<
    typeof GrowthRunInspectorRepository.listRecentCalibrationRecommendations
  >
>[number];
type DismissalReason = (typeof GROWTH_CALIBRATION_DISMISSAL_REASONS)[number];
type MonthlyCycleRow = Awaited<
  ReturnType<typeof GrowthRunInspectorRepository.listRecentMonthlyCycles>
>[number];

function durationMs(startedAt: string, completedAt: string | null, asOf: Date) {
  const start = new Date(startedAt).valueOf();
  const end = completedAt ? new Date(completedAt).valueOf() : asOf.valueOf();
  return Math.max(0, end - start);
}

function entityCount(value: unknown) {
  return Number(value);
}

function dismissalReason(value: string | null): DismissalReason {
  const reason = GROWTH_CALIBRATION_DISMISSAL_REASONS.find(
    (candidate) => candidate === value,
  );
  if (!reason)
    throw new AppError(
      "CONFLICT",
      "Saved Growth calibration dismissal reason is invalid",
    );
  return reason;
}

function summarizeCalibration(rows: CalibrationRow[]) {
  const dismissalReasons: Record<DismissalReason, number> = {
    irrelevant: 0,
    already_planned: 0,
    not_commercially_important: 0,
    insufficient_evidence: 0,
    wrong_diagnosis: 0,
    too_much_effort: 0,
    duplicate: 0,
    defer: 0,
  };
  let accepted = 0;
  let unresolved = 0;
  let reconciled = 0;
  for (const row of rows) {
    if (row.status === "accepted") accepted += 1;
    else if (row.status === "dismissed")
      dismissalReasons[dismissalReason(row.dismissalReason)] += 1;
    else if (row.status === "proposed" || row.status === "snoozed")
      unresolved += 1;
    else reconciled += 1;
  }
  const signalQualityFalsePositives = Object.entries(dismissalReasons).reduce(
    (total, [reason, value]) =>
      total + (SIGNAL_QUALITY_FALSE_POSITIVE_REASONS.has(reason) ? value : 0),
    0,
  );
  const dismissed = Object.values(dismissalReasons).reduce(
    (total, value) => total + value,
    0,
  );
  const otherDismissals = dismissed - signalQualityFalsePositives;
  const classified = accepted + signalQualityFalsePositives;
  return {
    sampled: rows.length,
    accepted,
    signalQualityFalsePositives,
    otherDismissals,
    unresolved,
    reconciled,
    classified,
    classificationCoverage: rows.length === 0 ? null : classified / rows.length,
    falsePositiveRate:
      classified === 0 ? null : signalQualityFalsePositives / classified,
    dismissalReasons,
  };
}

function buildCalibration(rows: CalibrationRow[]) {
  const sampledRows = rows.slice(0, CALIBRATION_LIMIT);
  const groups = new Map<string, CalibrationRow[]>();
  for (const row of sampledRows) {
    const group = groups.get(row.detectorVersion);
    if (group) group.push(row);
    else groups.set(row.detectorVersion, [row]);
  }
  return {
    limit: CALIBRATION_LIMIT,
    hasMore: rows.length > CALIBRATION_LIMIT,
    overall: summarizeCalibration(sampledRows),
    detectors: [...groups]
      .map(([detectorVersion, detectorRows]) => ({
        detectorVersion,
        ...summarizeCalibration(detectorRows.slice(0, CALIBRATION_LIMIT)),
      }))
      .toSorted(
        (left, right) =>
          right.sampled - left.sampled ||
          (left.detectorVersion < right.detectorVersion
            ? -1
            : left.detectorVersion > right.detectorVersion
              ? 1
              : 0),
      ),
  };
}

function cycleFailure(code: string | null, message: string | null) {
  return code && message ? { code, message } : null;
}

function cycleRun(row: MonthlyCycleRow, prefix: "parent" | "child") {
  const values = {
    id: row[`${prefix}Id`],
    trigger: row[`${prefix}Trigger`],
    status: row[`${prefix}Status`],
    periodStart: row[`${prefix}PeriodStart`],
    periodEnd: row[`${prefix}PeriodEnd`],
    startedAt: row[`${prefix}StartedAt`],
    completedAt: row[`${prefix}CompletedAt`],
    failureCode: row[`${prefix}FailureCode`],
    failureMessage: row[`${prefix}FailureMessage`],
  };
  if (values.id === null) return null;
  return {
    id: values.id,
    trigger: values.trigger!,
    status: values.status!,
    periodStart: values.periodStart!,
    periodEnd: values.periodEnd!,
    startedAt: values.startedAt!,
    completedAt: values.completedAt,
    failure: cycleFailure(values.failureCode, values.failureMessage),
  };
}

function nextCalendarDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function buildMonthlyCycleEvidence(rows: MonthlyCycleRow[]) {
  const cycles = rows.slice(0, MONTHLY_CYCLE_LIMIT).map((row) => {
    const parent = cycleRun(row, "parent");
    if (!parent)
      throw new AppError("CONFLICT", "Saved monthly review run is incomplete");
    return {
      parent,
      child: cycleRun(row, "child"),
      report:
        row.reportStatus === null
          ? null
          : {
              status: row.reportStatus,
              reportTimezone: row.reportTimezone!,
              dataCutoffAt: row.reportDataCutoffAt!,
              generatedAt: row.reportGeneratedAt!,
              createdByType: row.reportCreatedByType!,
            },
      recommendations: {
        accepted: entityCount(row.acceptedCount),
        dismissed: entityCount(row.dismissedCount),
        duplicateDismissals: entityCount(row.duplicateDismissalCount),
        unresolved: entityCount(row.unresolvedCount),
        reconciled: entityCount(row.reconciledCount),
      },
    };
  });
  const periods = [
    ...new Map(
      cycles.map(({ parent }) => [
        `${parent.periodStart}:${parent.periodEnd}`,
        { start: parent.periodStart, end: parent.periodEnd },
      ]),
    ).values(),
  ].toSorted(
    (left, right) =>
      right.start.localeCompare(left.start) ||
      right.end.localeCompare(left.end),
  );
  return {
    limit: MONTHLY_CYCLE_LIMIT,
    hasMore: rows.length > MONTHLY_CYCLE_LIMIT,
    distinctPeriods: periods.length,
    latestPeriodsAdjacent:
      periods.length < 2
        ? null
        : nextCalendarDate(periods[1].end) === periods[0].start,
    cycles,
  };
}

async function getRunInspector(
  projectId: string,
  now = new Date(),
): Promise<GrowthRunInspectorDto> {
  if (Number.isNaN(now.valueOf()))
    throw new AppError("VALIDATION_ERROR", "Run inspector clock is invalid");
  const [rows, calibrationRows, monthlyCycleRows] = await Promise.all([
    GrowthRunInspectorRepository.listRecentRuns(projectId, LIMIT + 1),
    GrowthRunInspectorRepository.listRecentCalibrationRecommendations(
      projectId,
      CALIBRATION_DETECTOR_VERSIONS,
      CALIBRATION_LIMIT + 1,
    ),
    GrowthRunInspectorRepository.listRecentMonthlyCycles(
      projectId,
      PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSIONS,
      MONTHLY_CYCLE_LIMIT + 1,
    ),
  ]);
  return growthRunInspectorDtoSchema.parse({
    asOf: now.toISOString(),
    calibration: buildCalibration(calibrationRows),
    monthlyCycleEvidence: buildMonthlyCycleEvidence(monthlyCycleRows),
    limit: LIMIT,
    hasMore: rows.length > LIMIT,
    runs: rows.slice(0, LIMIT).map((run) => ({
      id: run.id,
      runType: run.runType,
      trigger: run.trigger,
      status: run.status,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      durationMs: durationMs(run.startedAt, run.completedAt, now),
      detectorVersion: run.detectorVersion,
      analysisVersion: run.analysisVersion,
      providerCostMinor: run.providerCostMinor,
      failure:
        run.failureCode && run.failureMessage
          ? { code: run.failureCode, message: run.failureMessage }
          : null,
      entities: {
        signals: entityCount(run.signalCount),
        insights: entityCount(run.insightCount),
        recommendations: entityCount(run.recommendationCount),
        linkedActions: entityCount(run.linkedActionCount),
      },
    })),
  });
}

export const GrowthRunInspectorService = { getRunInspector } as const;
