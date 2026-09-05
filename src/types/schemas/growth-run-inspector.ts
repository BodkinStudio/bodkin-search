import { z } from "zod";
import {
  GROWTH_DISMISSAL_REASONS,
  GROWTH_RUN_STATUSES,
  GROWTH_RUN_TYPES,
} from "./growth";

const id = z.string().trim().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
const calibrationCount = count.max(200);

export const GROWTH_CALIBRATION_DISMISSAL_REASONS = GROWTH_DISMISSAL_REASONS;
export const GROWTH_SIGNAL_QUALITY_FALSE_POSITIVE_REASONS = [
  "irrelevant",
  "insufficient_evidence",
  "wrong_diagnosis",
] as const;
const SIGNAL_QUALITY_FALSE_POSITIVE_REASONS = new Set<string>(
  GROWTH_SIGNAL_QUALITY_FALSE_POSITIVE_REASONS,
);

const dismissalReasonCountsShape = {
  irrelevant: calibrationCount,
  already_planned: calibrationCount,
  not_commercially_important: calibrationCount,
  insufficient_evidence: calibrationCount,
  wrong_diagnosis: calibrationCount,
  too_much_effort: calibrationCount,
  duplicate: calibrationCount,
  defer: calibrationCount,
};

const calibrationCountsShape = {
  sampled: calibrationCount,
  accepted: calibrationCount,
  signalQualityFalsePositives: calibrationCount,
  otherDismissals: calibrationCount,
  unresolved: calibrationCount,
  reconciled: calibrationCount,
  classified: calibrationCount,
  classificationCoverage: z.number().min(0).max(1).nullable(),
  falsePositiveRate: z.number().min(0).max(1).nullable(),
  dismissalReasons: z.strictObject(dismissalReasonCountsShape),
};

const calibrationCountsObject = z.strictObject(calibrationCountsShape);
type CalibrationCounts = z.output<typeof calibrationCountsObject>;

function validateCalibrationCounts(
  value: CalibrationCounts,
  context: z.RefinementCtx,
) {
  const falsePositives =
    value.dismissalReasons.irrelevant +
    value.dismissalReasons.insufficient_evidence +
    value.dismissalReasons.wrong_diagnosis;
  const otherDismissals = GROWTH_CALIBRATION_DISMISSAL_REASONS.filter(
    (reason) => !SIGNAL_QUALITY_FALSE_POSITIVE_REASONS.has(reason),
  ).reduce((total, reason) => total + value.dismissalReasons[reason], 0);
  const classified = value.accepted + falsePositives;
  const sampled =
    value.accepted +
    falsePositives +
    otherDismissals +
    value.unresolved +
    value.reconciled;
  const expectedRate = classified ? falsePositives / classified : null;
  const expectedCoverage = sampled ? classified / sampled : null;
  for (const [path, actual, expected] of [
    [
      "signalQualityFalsePositives",
      value.signalQualityFalsePositives,
      falsePositives,
    ],
    ["otherDismissals", value.otherDismissals, otherDismissals],
    ["classified", value.classified, classified],
    ["sampled", value.sampled, sampled],
  ] as const) {
    if (actual !== expected)
      context.addIssue({
        code: "custom",
        path: [path],
        message: "Calibration totals are inconsistent",
      });
  }
  if (
    value.classificationCoverage !== expectedCoverage &&
    (value.classificationCoverage === null ||
      expectedCoverage === null ||
      Math.abs(value.classificationCoverage - expectedCoverage) > 1e-12)
  )
    context.addIssue({
      code: "custom",
      path: ["classificationCoverage"],
      message: "Calibration coverage is inconsistent",
    });
  if (
    value.falsePositiveRate !== expectedRate &&
    (value.falsePositiveRate === null ||
      expectedRate === null ||
      Math.abs(value.falsePositiveRate - expectedRate) > 1e-12)
  )
    context.addIssue({
      code: "custom",
      path: ["falsePositiveRate"],
      message: "Calibration rate is inconsistent",
    });
}

const calibrationSummarySchema = calibrationCountsObject.superRefine(
  validateCalibrationCounts,
);
const detectorCalibrationSchema = z
  .strictObject({
    detectorVersion: id,
    ...calibrationCountsShape,
  })
  .superRefine((value, context) => validateCalibrationCounts(value, context));

const growthMonitorCalibrationSchema = z
  .strictObject({
    limit: z.literal(200),
    hasMore: z.boolean(),
    overall: calibrationSummarySchema,
    detectors: z.array(detectorCalibrationSchema).max(200),
  })
  .superRefine((value, context) => {
    const versions = value.detectors.map(
      ({ detectorVersion }) => detectorVersion,
    );
    if (new Set(versions).size !== versions.length)
      context.addIssue({
        code: "custom",
        path: ["detectors"],
        message: "Detector calibration groups must be unique",
      });
    for (const key of [
      "sampled",
      "accepted",
      "signalQualityFalsePositives",
      "otherDismissals",
      "unresolved",
      "reconciled",
      "classified",
    ] as const) {
      const total = value.detectors.reduce(
        (sum, detector) => sum + detector[key],
        0,
      );
      if (total !== value.overall[key])
        context.addIssue({
          code: "custom",
          path: ["overall", key],
          message: "Overall calibration does not match detector groups",
        });
    }
    for (const reason of GROWTH_CALIBRATION_DISMISSAL_REASONS) {
      const total = value.detectors.reduce(
        (sum, detector) => sum + detector.dismissalReasons[reason],
        0,
      );
      if (total !== value.overall.dismissalReasons[reason])
        context.addIssue({
          code: "custom",
          path: ["overall", "dismissalReasons", reason],
          message: "Overall dismissal reasons do not match detector groups",
        });
    }
  });

export const growthRunInspectorRequestSchema = z.strictObject({
  projectId: id,
});

const inspectedRunSchema = z
  .strictObject({
    id,
    runType: z.enum(GROWTH_RUN_TYPES),
    trigger: z.enum(["manual", "scheduled"]),
    status: z.enum(GROWTH_RUN_STATUSES),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    startedAt: timestamp,
    completedAt: timestamp.nullable(),
    durationMs: count,
    detectorVersion: id,
    analysisVersion: id.nullable(),
    providerCostMinor: count.nullable(),
    failure: z
      .strictObject({ code: id, message: z.string().trim().min(1).max(1000) })
      .nullable(),
    entities: z.strictObject({
      signals: count,
      insights: count,
      recommendations: count,
      linkedActions: count,
    }),
  })
  .superRefine((run, context) => {
    const terminal = run.status !== "running";
    if (terminal !== (run.completedAt !== null))
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "Completion time must match the run status",
      });
    const failed =
      run.status === "failed" || run.status === "completed_with_errors";
    if (failed !== (run.failure !== null))
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "Failure details must match the run status",
      });
  });

export const growthRunInspectorDtoSchema = z.strictObject({
  asOf: timestamp,
  calibration: growthMonitorCalibrationSchema,
  limit: z.literal(20),
  hasMore: z.boolean(),
  runs: z.array(inspectedRunSchema).max(20),
});

export type GrowthRunInspectorDto = z.output<
  typeof growthRunInspectorDtoSchema
>;
