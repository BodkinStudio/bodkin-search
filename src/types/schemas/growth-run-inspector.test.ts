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

const response = {
  asOf: "2026-09-02T00:00:00.000Z",
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
});
