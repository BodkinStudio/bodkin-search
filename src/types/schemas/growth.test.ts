import { describe, expect, it } from "vitest";
import {
  completeGrowthRunSchema,
  completeGrowthRunWithErrorsSchema,
  createManualGrowthRunSchema,
  GROWTH_SETTINGS_DEFAULTS,
  growthSettingsInputSchema,
  recordGrowthSignalSchema,
  updateGrowthSettingsSchema,
} from "./growth";

describe("growth settings schemas", () => {
  it("accepts the documented defaults", () => {
    expect(growthSettingsInputSchema.parse(GROWTH_SETTINGS_DEFAULTS)).toEqual(
      GROWTH_SETTINGS_DEFAULTS,
    );
  });

  it("accepts weekly ISO weekdays and a disabled long window", () => {
    expect(
      updateGrowthSettingsSchema.parse({
        projectId: "project_1",
        ...GROWTH_SETTINGS_DEFAULTS,
        reportCadence: "weekly",
        reportDay: 7,
        defaultLongWindowDays: null,
      }),
    ).toMatchObject({
      reportCadence: "weekly",
      reportDay: 7,
      defaultLongWindowDays: null,
    });
  });

  it("rejects a weekly day outside the ISO weekday range", () => {
    expect(() =>
      growthSettingsInputSchema.parse({
        ...GROWTH_SETTINGS_DEFAULTS,
        reportCadence: "weekly",
        reportDay: 8,
      }),
    ).toThrow("Weekly report day must be an ISO weekday from 1 to 7");
  });

  it("rejects an invalid timezone", () => {
    expect(() =>
      growthSettingsInputSchema.parse({
        ...GROWTH_SETTINGS_DEFAULTS,
        reportTimezone: "Mars/Olympus_Mons",
      }),
    ).toThrow("Use a valid IANA timezone");
  });

  it("rejects measurement windows outside their bounds", () => {
    expect(() =>
      growthSettingsInputSchema.parse({
        ...GROWTH_SETTINGS_DEFAULTS,
        defaultCooldownDays: 366,
      }),
    ).toThrow();
    expect(() =>
      growthSettingsInputSchema.parse({
        ...GROWTH_SETTINGS_DEFAULTS,
        defaultLongWindowDays: 0,
      }),
    ).toThrow();
  });
});

describe("Growth run and Signal schemas", () => {
  const run = {
    projectId: "project_1",
    runType: "daily_monitor" as const,
    cadenceSlot: "2026-08-29",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-29",
    detectorVersion: "detector-v1",
  };

  it("accepts valid inclusive periods, including one day", () => {
    expect(
      createManualGrowthRunSchema.parse({
        ...run,
        periodStart: "2026-08-29",
        periodEnd: "2026-08-29",
      }),
    ).toMatchObject({ ...run, periodStart: "2026-08-29" });
  });

  it("rejects invalid calendar dates and reversed periods", () => {
    expect(() =>
      createManualGrowthRunSchema.parse({ ...run, periodStart: "2026-02-30" }),
    ).toThrow();
    expect(() =>
      createManualGrowthRunSchema.parse({ ...run, periodEnd: "2026-07-31" }),
    ).toThrow("Period end must be on or after period start");
  });

  it("requires failure metadata only for partial or failed outcomes", () => {
    expect(() =>
      completeGrowthRunSchema.parse({
        projectId: "project_1",
        runId: "run_1",
        failureCode: "upstream",
        failureMessage: "No response",
      }),
    ).toThrow("Completed runs cannot carry failure details");
    expect(() =>
      completeGrowthRunWithErrorsSchema.parse({
        projectId: "project_1",
        runId: "run_1",
      }),
    ).toThrow("Failure code and message are required");
  });

  it("enforces bounded text and nullable non-negative integer costs", () => {
    expect(
      completeGrowthRunSchema.parse({
        projectId: "project_1",
        runId: "run_1",
        providerCostMinor: null,
      }),
    ).toMatchObject({ providerCostMinor: null });
    expect(
      completeGrowthRunSchema.parse({
        projectId: "project_1",
        runId: "run_1",
        providerCostMinor: 0,
      }),
    ).toMatchObject({ providerCostMinor: 0 });
    expect(() =>
      completeGrowthRunSchema.parse({
        projectId: "project_1",
        runId: "run_1",
        providerCostMinor: -1,
      }),
    ).toThrow();
    expect(() =>
      completeGrowthRunSchema.parse({
        projectId: "project_1",
        runId: "run_1",
        providerCostMinor: 1.5,
      }),
    ).toThrow();
    expect(() =>
      createManualGrowthRunSchema.parse({
        ...run,
        detectorVersion: "x".repeat(101),
      }),
    ).toThrow();
  });

  it("enforces finite Signal facts, confidence and the evidence registry", () => {
    const signal = {
      projectId: "project_1",
      runId: "run_1",
      signalType: "page_clicks_down",
      entityType: "page",
      entityRef: "https://example.test/pricing",
      metric: "clicks",
      severity: "warning" as const,
      confidence: 0,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-29",
      baselineValue: 20,
      currentValue: 10,
      deltaValue: -10,
      evidenceKind: "gsc_period" as const,
      evidenceRef: "gsc:2026-08",
      capturedAt: "2026-08-29T10:00:00.000Z",
    };
    expect(recordGrowthSignalSchema.parse(signal)).toMatchObject(signal);
    expect(() =>
      recordGrowthSignalSchema.parse({ ...signal, confidence: 1.01 }),
    ).toThrow();
    expect(() =>
      recordGrowthSignalSchema.parse({ ...signal, baselineValue: Infinity }),
    ).toThrow();
    expect(() =>
      recordGrowthSignalSchema.parse({
        ...signal,
        evidenceKind: "raw_payload",
      }),
    ).toThrow();
  });
});
