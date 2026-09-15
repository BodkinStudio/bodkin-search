import { beforeEach, describe, expect, it, vi } from "vitest";

const runs = vi.hoisted(() => ({
  getRunBySlot: vi.fn(),
  claimScheduledRun: vi.fn(),
  completeRun: vi.fn(),
  completeRunWithErrors: vi.fn(),
  failRun: vi.fn(),
}));
const settings = vi.hoisted(() => ({ getSchedulingSettings: vi.fn() }));
const repository = vi.hoisted(() => ({ getCompactFacts: vi.fn() }));
const due = vi.hoisted(() => ({ getDueMeasurements: vi.fn() }));

vi.mock("./GrowthRunsService", () => ({ GrowthRunsService: runs }));
vi.mock("./GrowthSettingsService", () => ({ GrowthSettingsService: settings }));
vi.mock("../repositories/GrowthWeeklyReviewRepository", () => ({
  GrowthWeeklyReviewRepository: repository,
}));
vi.mock("./GrowthDueMeasurementsService", () => ({
  GrowthDueMeasurementsService: due,
}));

import {
  GROWTH_WEEKLY_REVIEW_VERSION,
  GrowthWeeklyReviewService,
} from "./GrowthWeeklyReviewService";

const input = {
  projectId: "project_1",
  cadenceSlot: "weekly-review:scheduled:2026-08-31:2026-09-06",
  periodStart: "2026-08-31",
  periodEnd: "2026-09-06",
  reportTimezone: "UTC",
  scheduledAt: "2026-09-07T00:00:00.000Z",
  settingsRevision: 3,
};
const executionAt = new Date("2026-09-10T12:00:00.000Z");

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: "weekly_run",
    projectId: "project_1",
    runType: "weekly_review",
    trigger: "scheduled",
    status: "running",
    cadenceSlot: input.cadenceSlot,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    startedAt: input.scheduledAt,
    completedAt: null,
    detectorVersion: GROWTH_WEEKLY_REVIEW_VERSION,
    analysisVersion: null,
    model: null,
    promptVersion: null,
    providerCostMinor: null,
    failureCode: null,
    failureMessage: null,
    ...overrides,
  };
}

describe("GrowthWeeklyReviewService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    runs.getRunBySlot.mockResolvedValue(null);
    settings.getSchedulingSettings.mockResolvedValue({
      growthEnabled: true,
      reportCadence: "weekly",
      reportTimezone: "UTC",
      settingsRevision: 3,
    });
    runs.claimScheduledRun.mockResolvedValue({ run: run(), claimed: true });
    repository.getCompactFacts.mockResolvedValue({
      materialGains: 1,
      materialLosses: 2,
      newStrikingDistanceOpportunities: 3,
      actionsAtRisk: 4,
    });
    due.getDueMeasurements.mockResolvedValue({
      scanState: "complete",
      items: [{ id: "due_1" }],
      hasMore: false,
    });
    runs.completeRun.mockResolvedValue(
      run({ status: "completed", completedAt: "2026-09-07T00:00:01.000Z" }),
    );
    runs.completeRunWithErrors.mockResolvedValue(
      run({
        status: "completed_with_errors",
        completedAt: "2026-09-07T00:00:01.000Z",
        failureCode: "WEEKLY_REVIEW_PARTIAL",
        failureMessage:
          "Weekly review completed with an incomplete due-Measurement section.",
      }),
    );
    runs.failRun.mockResolvedValue(
      run({
        status: "failed",
        completedAt: "2026-09-07T00:00:01.000Z",
        failureCode: "WEEKLY_REVIEW_FAILED",
        failureMessage: "Weekly review facts could not be read.",
      }),
    );
  });

  it("claims a scheduled weekly Run and returns the compact saved-data review", async () => {
    const result = await GrowthWeeklyReviewService.runScheduledWeeklyReview(
      input,
      executionAt,
    );

    expect(runs.claimScheduledRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runType: "weekly_review",
        reportCadence: "weekly",
        settingsRevision: 3,
      }),
    );
    expect(repository.getCompactFacts).toHaveBeenCalledWith({
      projectId: "project_1",
      startAt: "2026-08-31T00:00:00.000Z",
      endAt: "2026-09-07T00:00:00.000Z",
      asOf: "2026-09-10T12:00:00.000Z",
    });
    expect(due.getDueMeasurements).toHaveBeenCalledWith("project_1", {
      now: executionAt,
    });
    expect(result).toMatchObject({
      replayed: false,
      sections: {
        materialGains: 1,
        materialLosses: 2,
        newStrikingDistanceOpportunities: 3,
        actionsAtRisk: 4,
        actionsReadyForMeasurement: 1,
        recommendedFocus: "measurement_review",
      },
      warnings: [],
    });
  });

  it("marks due-measurement overflow partial and prioritises a rescan", async () => {
    due.getDueMeasurements.mockResolvedValue({
      scanState: "overflow",
      items: [],
      hasMore: true,
    });
    await expect(
      GrowthWeeklyReviewService.runScheduledWeeklyReview(input),
    ).resolves.toMatchObject({
      replayed: false,
      run: { status: "completed_with_errors" },
      sections: {
        actionsReadyForMeasurement: null,
        recommendedFocus: "measurement_scan_required",
      },
      warnings: ["DUE_MEASUREMENTS_OVERFLOW"],
    });
  });

  it("replays a terminal Run without reading current facts", async () => {
    runs.getRunBySlot.mockResolvedValue(
      run({ status: "completed", completedAt: "2026-09-07T00:00:01.000Z" }),
    );
    await expect(
      GrowthWeeklyReviewService.runScheduledWeeklyReview(input),
    ).resolves.toMatchObject({ replayed: true, run: { status: "completed" } });
    expect(settings.getSchedulingSettings).not.toHaveBeenCalled();
    expect(repository.getCompactFacts).not.toHaveBeenCalled();
  });

  it("resumes with frozen period facts and current operational state", async () => {
    runs.getRunBySlot.mockResolvedValue(run());
    await expect(
      GrowthWeeklyReviewService.runScheduledWeeklyReview(input, executionAt),
    ).resolves.toMatchObject({ replayed: false });
    expect(runs.claimScheduledRun).not.toHaveBeenCalled();
    expect(repository.getCompactFacts).toHaveBeenCalledWith({
      projectId: "project_1",
      startAt: "2026-08-31T00:00:00.000Z",
      endAt: "2026-09-07T00:00:00.000Z",
      asOf: "2026-09-10T12:00:00.000Z",
    });
    expect(due.getDueMeasurements).toHaveBeenCalledWith("project_1", {
      now: executionAt,
    });
  });

  it("skips stale settings before claiming or reading facts", async () => {
    settings.getSchedulingSettings.mockResolvedValue({
      growthEnabled: true,
      reportCadence: "weekly",
      reportTimezone: "UTC",
      settingsRevision: 4,
    });
    await expect(
      GrowthWeeklyReviewService.runScheduledWeeklyReview(input),
    ).resolves.toEqual({ skipped: true, reason: "settings_changed" });
    expect(runs.claimScheduledRun).not.toHaveBeenCalled();
    expect(repository.getCompactFacts).not.toHaveBeenCalled();
  });

  it("chooses exactly one deterministic focus when no measurement is due", async () => {
    due.getDueMeasurements.mockResolvedValue({
      scanState: "complete",
      items: [],
      hasMore: false,
    });
    repository.getCompactFacts.mockResolvedValue({
      materialGains: 2,
      materialLosses: 1,
      newStrikingDistanceOpportunities: 3,
      actionsAtRisk: 4,
    });
    await expect(
      GrowthWeeklyReviewService.runScheduledWeeklyReview(input),
    ).resolves.toMatchObject({
      sections: { recommendedFocus: "action_recovery" },
    });
  });
});
