import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import type { RecordGrowthSignalInput } from "@/types/schemas/growth";
import {
  calendarDateInTimezone,
  growthMeasurementSourceAvailableOn,
} from "./GrowthMeasurementFacts";

export const MEASUREMENT_DUE_DETECTOR_VERSION = "measurement-due-v1";
const GSC_SOURCE_TIMEZONE = "America/Los_Angeles";

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
const candidateSchema = z
  .strictObject({
    id: z.string().trim().min(1).max(100),
    actionId: z.string().trim().min(1).max(100),
    actionVersion: z.number().int().nonnegative(),
    reportTimezone: z.string().trim().min(1).max(100),
    measurementEnd: calendarDate,
    longMeasurementEnd: calendarDate.nullable(),
    actionStatus: z.string().nullable(),
    actionStateVersion: z.number().int().nonnegative().nullable(),
    actionTitle: z.string().nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.longMeasurementEnd != null &&
      value.longMeasurementEnd <= value.measurementEnd
    )
      context.addIssue({
        code: "custom",
        path: ["measurementEnd"],
        message: "Measurement window is invalid",
      });
  });
const inputSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(100),
  runId: z.string().trim().min(1).max(100),
  capturedAt: z.string().datetime({ offset: true }),
  candidates: z.array(candidateSchema).max(50),
});

type Candidate = z.output<typeof candidateSchema>;

function finalPeriodEnd(candidate: Candidate) {
  return candidate.longMeasurementEnd ?? candidate.measurementEnd;
}

function consistent(candidate: Candidate) {
  return (
    candidate.actionStatus === "measuring" &&
    candidate.actionStateVersion === candidate.actionVersion
  );
}

function evidenceRef(candidate: Candidate, sourceAvailableOn: string) {
  const value = `manual_observation:v1:measurement_due:${encodeURIComponent(candidate.id)}:${candidate.actionVersion}:${sourceAvailableOn}`;
  if (value.length > 500)
    throw new AppError(
      "VALIDATION_ERROR",
      "Measurement due evidence identity is too long",
    );
  return value;
}

export function parseMeasurementDueEvidenceRef(value: string) {
  const parts = value.split(":");
  if (
    parts.length !== 6 ||
    parts[0] !== "manual_observation" ||
    parts[1] !== "v1" ||
    parts[2] !== "measurement_due" ||
    !/^\d+$/.test(parts[4] ?? "") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(parts[5] ?? "")
  )
    return null;
  try {
    const measurementPlanId = decodeURIComponent(parts[3] ?? "");
    const actionVersion = Number(parts[4]);
    if (
      !measurementPlanId ||
      measurementPlanId.length > 100 ||
      !Number.isSafeInteger(actionVersion)
    )
      return null;
    return {
      measurementPlanId,
      actionVersion,
      sourceAvailableOn: parts[5],
    };
  } catch {
    return null;
  }
}

type MeasurementDueDetection = {
  signal: RecordGrowthSignalInput;
  measurementPlanId: string;
  actionId: string;
  actionVersion: number;
  sourceAvailableOn: string;
};

export function detectMeasurementsDue(raw: z.input<typeof inputSchema>): {
  detections: MeasurementDueDetection[];
  skippedInconsistentCount: number;
} {
  const input = inputSchema.parse(raw);
  const sourceDate = calendarDateInTimezone(
    input.capturedAt,
    GSC_SOURCE_TIMEZONE,
  );
  let skippedInconsistentCount = 0;
  const detections: MeasurementDueDetection[] = input.candidates.flatMap(
    (candidate) => {
      if (!consistent(candidate)) {
        skippedInconsistentCount += 1;
        return [];
      }
      const finalEnd = finalPeriodEnd(candidate);
      const sourceAvailableOn = growthMeasurementSourceAvailableOn(finalEnd);
      if (sourceDate < sourceAvailableOn) return [];
      return [
        {
          measurementPlanId: candidate.id,
          actionId: candidate.actionId,
          actionVersion: candidate.actionVersion,
          sourceAvailableOn,
          signal: {
            projectId: input.projectId,
            runId: input.runId,
            signalType: "action_measurement_due",
            entityType: "growth_action",
            entityRef: candidate.actionId,
            metric: "measurement_review_due",
            severity: "info",
            confidence: 1,
            periodStart: finalEnd,
            periodEnd: finalEnd,
            baselineValue: 0,
            currentValue: 1,
            deltaValue: 1,
            deltaPercent: null,
            evidenceKind: "manual_observation",
            evidenceRef: evidenceRef(candidate, sourceAvailableOn),
            capturedAt: input.capturedAt,
          },
        },
      ];
    },
  );
  return {
    detections: detections.toSorted(
      (left, right) =>
        left.sourceAvailableOn.localeCompare(right.sourceAvailableOn) ||
        left.measurementPlanId.localeCompare(right.measurementPlanId),
    ),
    skippedInconsistentCount,
  };
}
