import { describe, expect, it } from "vitest";
import {
  growthRunInspectorDtoSchema,
  growthRunInspectorRequestSchema,
} from "./growth-run-inspector";

const run = {
  id: "run_1",
  runType: "manual_analysis",
  trigger: "manual",
  status: "completed",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  startedAt: "2026-09-01T00:00:00.000Z",
  completedAt: "2026-09-01T00:00:01.000Z",
  durationMs: 1_000,
  detectorVersion: "detector-v1",
  analysisVersion: null,
  providerCostMinor: null,
  failure: null,
  entities: { signals: 1, insights: 0, recommendations: 0, linkedActions: 0 },
} as const;

const calibrationCounts = {
  sampled: 1,
  accepted: 1,
  signalQualityFalsePositives: 0,
  otherDismissals: 0,
  unresolved: 0,
  reconciled: 0,
  classified: 1,
  classificationCoverage: 1,
  falsePositiveRate: 0,
  dismissalReasons: {
    irrelevant: 0,
    already_planned: 0,
    not_commercially_important: 0,
    insufficient_evidence: 0,
    wrong_diagnosis: 0,
    too_much_effort: 0,
    duplicate: 0,
    defer: 0,
  },
} as const;

const response = {
  asOf: "2026-09-02T00:00:00.000Z",
  calibration: {
    limit: 200,
    hasMore: false,
    overall: calibrationCounts,
    detectors: [{ detectorVersion: "detector-v1", ...calibrationCounts }],
  },
  limit: 20,
  hasMore: false,
  runs: [run],
} as const;

describe("growthRunInspector schemas", () => {
  it("accepts the strict bounded request and response", () => {
    expect(
      growthRunInspectorRequestSchema.parse({ projectId: "project_1" }),
    ).toEqual({ projectId: "project_1" });
    expect(growthRunInspectorDtoSchema.parse(response)).toEqual(response);
  });

  it("accepts unavailable coverage and rate for an empty cohort", () => {
    const emptyCounts = {
      ...calibrationCounts,
      sampled: 0,
      accepted: 0,
      classified: 0,
      classificationCoverage: null,
      falsePositiveRate: null,
    };
    expect(
      growthRunInspectorDtoSchema.safeParse({
        ...response,
        calibration: {
          ...response.calibration,
          overall: emptyCounts,
          detectors: [],
        },
      }).success,
    ).toBe(true);
  });

  it("rejects unknown request and response fields", () => {
    expect(
      growthRunInspectorRequestSchema.safeParse({
        projectId: "project_1",
        includeSecrets: true,
      }).success,
    ).toBe(false);
    expect(
      growthRunInspectorDtoSchema.safeParse({ ...response, rawLogs: [] })
        .success,
    ).toBe(false);
  });

  it("rejects more than twenty runs", () => {
    expect(
      growthRunInspectorDtoSchema.safeParse({
        ...response,
        runs: Array.from({ length: 21 }, (_, index) => ({
          ...run,
          id: `run_${index}`,
        })),
      }).success,
    ).toBe(false);
    expect(
      growthRunInspectorDtoSchema.safeParse({
        ...response,
        calibration: {
          ...response.calibration,
          overall: {
            ...response.calibration.overall,
            classificationCoverage: 0.5,
          },
        },
      }).success,
    ).toBe(false);
  });

  it("requires terminal timestamps and matching failure details", () => {
    expect(
      growthRunInspectorDtoSchema.safeParse({
        ...response,
        runs: [{ ...run, completedAt: null }],
      }).success,
    ).toBe(false);
    expect(
      growthRunInspectorDtoSchema.safeParse({
        ...response,
        runs: [{ ...run, status: "failed", failure: null }],
      }).success,
    ).toBe(false);
    expect(
      growthRunInspectorDtoSchema.safeParse({
        ...response,
        runs: [
          {
            ...run,
            status: "failed",
            failure: { code: "FAILED", message: "Safe failure" },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects negative or fractional durations and counts", () => {
    expect(
      growthRunInspectorDtoSchema.safeParse({
        ...response,
        runs: [{ ...run, durationMs: -1 }],
      }).success,
    ).toBe(false);
    expect(
      growthRunInspectorDtoSchema.safeParse({
        ...response,
        runs: [{ ...run, entities: { ...run.entities, recommendations: 1.5 } }],
      }).success,
    ).toBe(false);
  });

  it("rejects inconsistent calibration totals, rates and detector groups", () => {
    const detector = {
      detectorVersion: "detector-v1",
      ...response.calibration.overall,
    };
    expect(
      growthRunInspectorDtoSchema.safeParse({
        ...response,
        calibration: {
          ...response.calibration,
          overall: { ...response.calibration.overall, sampled: 2 },
        },
      }).success,
    ).toBe(false);
    expect(
      growthRunInspectorDtoSchema.safeParse({
        ...response,
        calibration: {
          ...response.calibration,
          overall: {
            ...response.calibration.overall,
            falsePositiveRate: 0.5,
          },
        },
      }).success,
    ).toBe(false);
    expect(
      growthRunInspectorDtoSchema.safeParse({
        ...response,
        calibration: {
          ...response.calibration,
          overall: {
            ...response.calibration.overall,
            sampled: 2,
            accepted: 2,
            classified: 2,
            classificationCoverage: 1,
          },
          detectors: [detector, detector],
        },
      }).success,
    ).toBe(false);
    expect(
      growthRunInspectorDtoSchema.safeParse({
        ...response,
        calibration: {
          ...response.calibration,
          overall: {
            ...response.calibration.overall,
            sampled: 0,
            accepted: 0,
            classified: 0,
            classificationCoverage: null,
            falsePositiveRate: null,
          },
          detectors: Array.from({ length: 201 }, (_, index) => ({
            ...detector,
            detectorVersion: `detector-${index}`,
            sampled: 0,
            accepted: 0,
            classified: 0,
            classificationCoverage: null,
            falsePositiveRate: null,
          })),
        },
      }).success,
    ).toBe(false);
  });
});
