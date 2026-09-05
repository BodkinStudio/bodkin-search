/* eslint-disable max-lines, max-lines-per-function -- the complete coordinator replay and phase-classification contract is easiest to audit in one mocked-service suite */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GROWTH_REPORT_SECTION_TYPES } from "@/types/schemas/growth-reports";

const runs = vi.hoisted(() => ({
  getRunBySlot: vi.fn(),
  claimManualRun: vi.fn(),
  claimScheduledRun: vi.fn(),
  completeRun: vi.fn(),
  completeRunWithErrors: vi.fn(),
  failRun: vi.fn(),
}));
const settings = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getSchedulingSettings: vi.fn(),
}));
const check = vi.hoisted(() => ({
  runCheck: vi.fn(),
  runScheduledCheck: vi.fn(),
}));
const due = vi.hoisted(() => ({ getDueMeasurements: vi.fn() }));
const reports = vi.hoisted(() => ({
  buildGrowthMonthlyReport: vi.fn(),
  buildScheduledGrowthMonthlyReport: vi.fn(),
}));

vi.mock("./GrowthRunsService", () => ({ GrowthRunsService: runs }));
vi.mock("./GrowthSettingsService", () => ({ GrowthSettingsService: settings }));
vi.mock("./GrowthPriorityPageCheckService", () => ({
  GrowthPriorityPageCheckService: check,
}));
vi.mock("./GrowthDueMeasurementsService", () => ({
  GrowthDueMeasurementsService: due,
}));
vi.mock("./GrowthMonthlyReportsService", () => ({
  GrowthMonthlyReportsService: reports,
}));

import {
  GROWTH_MONTHLY_REVIEW_VERSION,
  GrowthMonthlyReviewService,
} from "./GrowthMonthlyReviewService";

const now = new Date("2026-09-01T08:00:00.000Z");
const request = { projectId: "project_echo", requestKey: "review_1" };

function parentRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "parent_run",
    projectId: "project_authorized",
    runType: "monthly_review",
    trigger: "manual",
    status: "running",
    cadenceSlot: "monthly-review:review_1",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    startedAt: "2026-09-01T08:00:00.000Z",
    completedAt: null,
    detectorVersion: GROWTH_MONTHLY_REVIEW_VERSION,
    analysisVersion: null,
    model: null,
    promptVersion: null,
    providerCostMinor: null,
    failureCode: null,
    failureMessage: null,
    ...overrides,
  };
}

function childRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "child_run",
    status: "completed",
    periodStart: "2026-07-05",
    periodEnd: "2026-08-29",
    startedAt: "2026-09-01T08:00:01.000Z",
    completedAt: "2026-09-01T08:00:02.000Z",
    failureCode: null,
    failureMessage: null,
    ...overrides,
  };
}

const completeDue = {
  scanState: "complete" as const,
  items: [],
  hasMore: false,
};
const noActivity = {
  state: "no_activity" as const,
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  reportTimezone: "Europe/London",
  message: "There is no eligible saved activity.",
};
const exactReport = {
  state: "report" as const,
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  reportTimezone: "Europe/London",
  report: {
    status: "draft" as const,
    version: 1,
    generatedAt: "2026-09-01T08:00:00.000Z",
    dataCutoffAt: "2026-09-01T08:00:00.000Z",
    sections: GROWTH_REPORT_SECTION_TYPES.map((sectionType) => ({
      sectionType,
      title: sectionType,
      summary: `${sectionType} summary`,
      items: [],
    })),
  },
};

function terminal(status: "completed" | "completed_with_errors" | "failed") {
  const failure =
    status === "completed"
      ? {}
      : status === "completed_with_errors"
        ? {
            failureCode: "MONTHLY_REVIEW_PARTIAL",
            failureMessage:
              "Monthly review completed with one or more incomplete phases.",
          }
        : {
            failureCode: "MONTHLY_REVIEW_FAILED",
            failureMessage: "Monthly review could not complete any phase.",
          };
  return parentRun({
    status,
    completedAt: "2026-09-01T08:00:03.000Z",
    ...failure,
  });
}

describe("GrowthMonthlyReviewService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    runs.getRunBySlot.mockResolvedValue(null);
    settings.getSettings.mockResolvedValue({
      reportTimezone: "Europe/London",
    });
    settings.getSchedulingSettings.mockResolvedValue({ settingsRevision: 1 });
    runs.claimManualRun.mockResolvedValue({
      run: parentRun(),
      claimed: true,
    });
    check.runCheck.mockResolvedValue({
      run: childRun(),
      replayed: false,
    });
    check.runScheduledCheck.mockResolvedValue({
      run: childRun(),
      replayed: false,
    });
    due.getDueMeasurements.mockResolvedValue(completeDue);
    reports.buildGrowthMonthlyReport.mockResolvedValue(noActivity);
    reports.buildScheduledGrowthMonthlyReport.mockResolvedValue(noActivity);
    runs.completeRun.mockResolvedValue(terminal("completed"));
    runs.completeRunWithErrors.mockResolvedValue(
      terminal("completed_with_errors"),
    );
    runs.failRun.mockResolvedValue(terminal("failed"));
  });

  it("claims scheduled provenance and builds the report as the system actor", async () => {
    const scheduledRun = parentRun({
      trigger: "scheduled",
      cadenceSlot: "monthly-review:scheduled:2026-08-01:2026-08-31",
    });
    settings.getSettings.mockResolvedValue({
      persisted: true,
      growthEnabled: true,
      reportCadence: "monthly",
      reportTimezone: "Europe/London",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    runs.claimScheduledRun.mockResolvedValue({
      run: scheduledRun,
      claimed: true,
    });

    const result = await GrowthMonthlyReviewService.runScheduledMonthlyReview(
      {
        projectId: "project_authorized",
        cadenceSlot: "monthly-review:scheduled:2026-08-01:2026-08-31",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        reportTimezone: "Europe/London",
        scheduledAt: "2026-09-01T00:00:00.000Z",
        settingsRevision: 1,
      },
      now,
    );

    expect(runs.claimScheduledRun).toHaveBeenCalledWith(
      expect.objectContaining({
        cadenceSlot: "monthly-review:scheduled:2026-08-01:2026-08-31",
        settingsRevision: 1,
      }),
    );
    expect(reports.buildScheduledGrowthMonthlyReport).toHaveBeenCalledWith(
      "project_authorized",
      {
        projectId: "project_authorized",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        reportTimezone: "Europe/London",
      },
      now,
    );
    expect(check.runScheduledCheck).toHaveBeenCalledWith({
      projectId: "project_authorized",
      requestKey: "monthly_parent_run",
      settingsRevision: 1,
    });
    expect(check.runCheck).not.toHaveBeenCalled();
    expect(result).toMatchObject({ replayed: false });
  });

  it("skips a scheduled claim when its observed settings revision changed", async () => {
    settings.getSettings.mockResolvedValue({
      persisted: true,
      growthEnabled: true,
      reportCadence: "monthly",
      reportTimezone: "Europe/London",
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    settings.getSchedulingSettings.mockResolvedValue({ settingsRevision: 2 });

    await expect(
      GrowthMonthlyReviewService.runScheduledMonthlyReview({
        projectId: "project_authorized",
        cadenceSlot: "monthly-review:scheduled:2026-08-01:2026-08-31",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        reportTimezone: "Europe/London",
        scheduledAt: "2026-09-01T00:00:00.000Z",
        settingsRevision: 1,
      }),
    ).resolves.toEqual({ skipped: true, reason: "settings_changed" });
    expect(runs.claimScheduledRun).not.toHaveBeenCalled();
    expect(check.runCheck).not.toHaveBeenCalled();
    expect(check.runScheduledCheck).not.toHaveBeenCalled();
  });

  it("resumes a compatible scheduled running Run after a Workflow retry", async () => {
    runs.getRunBySlot.mockResolvedValue(
      parentRun({
        trigger: "scheduled",
        cadenceSlot: "monthly-review:scheduled:2026-08-01:2026-08-31",
      }),
    );
    settings.getSettings.mockResolvedValue({
      persisted: true,
      growthEnabled: true,
      reportCadence: "monthly",
      reportTimezone: "Europe/London",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });

    const result = await GrowthMonthlyReviewService.runScheduledMonthlyReview(
      {
        projectId: "project_authorized",
        cadenceSlot: "monthly-review:scheduled:2026-08-01:2026-08-31",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        reportTimezone: "Europe/London",
        scheduledAt: "2026-09-01T00:00:00.000Z",
        settingsRevision: 1,
      },
      now,
    );

    expect(runs.claimScheduledRun).not.toHaveBeenCalled();
    expect(check.runScheduledCheck).toHaveBeenCalled();
    expect(result).toMatchObject({ replayed: false });
  });

  it("terminalizes a resumed scheduled Run when its settings were disabled", async () => {
    runs.getRunBySlot.mockResolvedValue(
      parentRun({
        trigger: "scheduled",
        cadenceSlot: "monthly-review:scheduled:2026-08-01:2026-08-31",
      }),
    );
    settings.getSettings.mockResolvedValue({
      persisted: true,
      growthEnabled: false,
      reportCadence: "monthly",
      reportTimezone: "Europe/London",
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    runs.failRun.mockResolvedValue(terminal("failed"));

    const result = await GrowthMonthlyReviewService.runScheduledMonthlyReview(
      {
        projectId: "project_authorized",
        cadenceSlot: "monthly-review:scheduled:2026-08-01:2026-08-31",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        reportTimezone: "Europe/London",
        scheduledAt: "2026-09-01T00:00:00.000Z",
        settingsRevision: 1,
      },
      now,
    );

    expect(runs.failRun).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: "MONTHLY_REVIEW_FAILED" }),
    );
    expect(check.runScheduledCheck).not.toHaveBeenCalled();
    expect(result).toMatchObject({ replayed: true, run: { status: "failed" } });
  });

  it("replays an exact stored running envelope before settings or phase work", async () => {
    runs.getRunBySlot.mockResolvedValue(parentRun());

    const result = await GrowthMonthlyReviewService.runMonthlyReview(
      "project_authorized",
      "user_authorized",
      request,
      now,
    );
    expect(result).toMatchObject({
      replayed: true,
      run: { id: "parent_run", status: "running" },
    });
    expect(Object.keys(result)).toEqual(["replayed", "run"]);
    expect(settings.getSettings).not.toHaveBeenCalled();
    expect(runs.claimManualRun).not.toHaveBeenCalled();
    expect(check.runCheck).not.toHaveBeenCalled();
    expect(due.getDueMeasurements).not.toHaveBeenCalled();
    expect(reports.buildGrowthMonthlyReport).not.toHaveBeenCalled();
  });

  it("allows a different explicit key to claim independently after a running replay", async () => {
    runs.getRunBySlot
      .mockResolvedValueOnce(parentRun())
      .mockResolvedValueOnce(null);
    await GrowthMonthlyReviewService.runMonthlyReview(
      "project_authorized",
      "user_authorized",
      request,
      now,
    );

    const secondRun = parentRun({
      id: "parent_run_2",
      cadenceSlot: "monthly-review:review_2",
    });
    runs.claimManualRun.mockResolvedValue({ run: secondRun, claimed: true });
    runs.completeRun.mockResolvedValue({
      ...terminal("completed"),
      id: "parent_run_2",
      cadenceSlot: "monthly-review:review_2",
    });
    await GrowthMonthlyReviewService.runMonthlyReview(
      "project_authorized",
      "user_authorized",
      { ...request, requestKey: "review_2" },
      now,
    );
    expect(runs.claimManualRun).toHaveBeenCalledWith(
      expect.objectContaining({ cadenceSlot: "monthly-review:review_2" }),
    );
    expect(check.runCheck).toHaveBeenCalledWith({
      projectId: "project_authorized",
      requestKey: "monthly_parent_run_2",
    });
  });

  it.each([
    { trigger: "scheduled" },
    { detectorVersion: "growth-monthly-review-v0" },
    { cadenceSlot: "monthly-review:other" },
  ])("rejects an incompatible pre-existing slot (%o)", async (drift) => {
    runs.getRunBySlot.mockResolvedValue(parentRun(drift));

    await expect(
      GrowthMonthlyReviewService.runMonthlyReview(
        "project_authorized",
        "user_authorized",
        request,
        now,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(settings.getSettings).not.toHaveBeenCalled();
    expect(check.runCheck).not.toHaveBeenCalled();
  });

  it("post-qualifies the concurrent winner before replay and does no phase work", async () => {
    runs.claimManualRun.mockResolvedValue({
      run: parentRun({ detectorVersion: "other-version" }),
      claimed: false,
    });

    await expect(
      GrowthMonthlyReviewService.runMonthlyReview(
        "project_authorized",
        "user_authorized",
        request,
        now,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(check.runCheck).not.toHaveBeenCalled();
    expect(due.getDueMeasurements).not.toHaveBeenCalled();
    expect(reports.buildGrowthMonthlyReport).not.toHaveBeenCalled();
  });

  it("lets only one of two concurrent claim contenders run phases", async () => {
    runs.claimManualRun
      .mockResolvedValueOnce({ run: parentRun(), claimed: true })
      .mockResolvedValueOnce({ run: parentRun(), claimed: false });

    const results = await Promise.all([
      GrowthMonthlyReviewService.runMonthlyReview(
        "project_authorized",
        "user_authorized",
        request,
        now,
      ),
      GrowthMonthlyReviewService.runMonthlyReview(
        "project_authorized",
        "user_authorized",
        request,
        now,
      ),
    ]);
    expect(results.filter(({ replayed }) => replayed)).toHaveLength(1);
    expect(results.filter(({ replayed }) => !replayed)).toHaveLength(1);
    expect(check.runCheck).toHaveBeenCalledOnce();
    expect(due.getDueMeasurements).toHaveBeenCalledOnce();
    expect(reports.buildGrowthMonthlyReport).toHaveBeenCalledOnce();
  });

  it("runs all phases in order with the authorized scope and one captured clock", async () => {
    const result = await GrowthMonthlyReviewService.runMonthlyReview(
      "project_authorized",
      "user_authorized",
      request,
      now,
    );

    expect(runs.claimManualRun).toHaveBeenCalledWith({
      projectId: "project_authorized",
      runType: "monthly_review",
      cadenceSlot: "monthly-review:review_1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      detectorVersion: GROWTH_MONTHLY_REVIEW_VERSION,
    });
    expect(check.runCheck).toHaveBeenCalledWith({
      projectId: "project_authorized",
      requestKey: "monthly_parent_run",
    });
    expect(due.getDueMeasurements).toHaveBeenCalledWith("project_authorized", {
      now,
    });
    expect(reports.buildGrowthMonthlyReport).toHaveBeenCalledWith(
      "project_authorized",
      "user_authorized",
      {
        projectId: "project_authorized",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        reportTimezone: "Europe/London",
      },
      now,
    );
    expect(check.runCheck.mock.invocationCallOrder[0]).toBeLessThan(
      due.getDueMeasurements.mock.invocationCallOrder[0] ?? 0,
    );
    expect(due.getDueMeasurements.mock.invocationCallOrder[0]).toBeLessThan(
      reports.buildGrowthMonthlyReport.mock.invocationCallOrder[0] ?? 0,
    );
    expect(
      reports.buildGrowthMonthlyReport.mock.invocationCallOrder[0],
    ).toBeLessThan(runs.completeRun.mock.invocationCallOrder[0] ?? 0);
    expect(result).toMatchObject({
      replayed: false,
      consistency: "current_not_snapshot",
      run: { status: "completed" },
      check: { run: { status: "completed" } },
      dueMeasurements: { scanState: "complete" },
      report: { state: "no_activity" },
      warnings: [],
    });
  });

  it("accepts an exact immutable report winner as a useful report phase", async () => {
    reports.buildGrowthMonthlyReport.mockResolvedValue(exactReport);
    await expect(
      GrowthMonthlyReviewService.runMonthlyReview(
        "project_authorized",
        "user_authorized",
        request,
        now,
      ),
    ).resolves.toMatchObject({
      run: { status: "completed" },
      report: {
        state: "report",
        reportTimezone: "Europe/London",
        report: { status: "draft", version: 1 },
      },
      warnings: [],
    });
  });

  it("treats a child partial as useful and terminalizes with one static warning", async () => {
    check.runCheck.mockResolvedValue({
      run: childRun({
        status: "completed_with_errors",
        failureCode: "RAW_PARTIAL_CODE",
        failureMessage: "RAW_PARTIAL_SECRET",
      }),
      replayed: false,
    });

    const result = await GrowthMonthlyReviewService.runMonthlyReview(
      "project_authorized",
      "user_authorized",
      request,
      now,
    );
    expect(result).toMatchObject({
      run: {
        status: "completed_with_errors",
        failureCode: "MONTHLY_REVIEW_PARTIAL",
      },
      warnings: ["PRIORITY_PAGE_CHECK_PARTIAL"],
    });
    expect(JSON.stringify(result)).not.toContain("RAW_PARTIAL");
    expect(runs.completeRunWithErrors).toHaveBeenCalledWith({
      projectId: "project_authorized",
      runId: "parent_run",
      failureCode: "MONTHLY_REVIEW_PARTIAL",
      failureMessage:
        "Monthly review completed with one or more incomplete phases.",
    });
  });

  it.each([
    {
      label: "returned failure",
      secret: "RAW_CHILD_SECRET",
      arrange: () =>
        check.runCheck.mockResolvedValue({
          run: childRun({
            status: "failed",
            failureCode: "RAW_CHILD_CODE",
            failureMessage: "RAW_CHILD_SECRET",
          }),
          replayed: false,
        }),
    },
    {
      label: "setup exception",
      secret: "RAW_SETUP_SECRET",
      arrange: () =>
        check.runCheck.mockRejectedValue(new Error("RAW_SETUP_SECRET")),
    },
  ])(
    "continues due and report after a check $label",
    async ({ arrange, secret }) => {
      arrange();
      const result = await GrowthMonthlyReviewService.runMonthlyReview(
        "project_authorized",
        "user_authorized",
        request,
        now,
      );
      expect(due.getDueMeasurements).toHaveBeenCalledOnce();
      expect(reports.buildGrowthMonthlyReport).toHaveBeenCalledOnce();
      expect(result).toMatchObject({
        run: { status: "completed_with_errors" },
        warnings: ["PRIORITY_PAGE_CHECK_FAILED"],
      });
      expect(JSON.stringify(result)).not.toContain(secret);
    },
  );

  it("fails the envelope and stops downstream work while a child remains running", async () => {
    check.runCheck.mockResolvedValue({
      run: childRun({ status: "running", completedAt: null }),
      replayed: true,
    });

    const result = await GrowthMonthlyReviewService.runMonthlyReview(
      "project_authorized",
      "user_authorized",
      request,
      now,
    );
    expect(due.getDueMeasurements).not.toHaveBeenCalled();
    expect(reports.buildGrowthMonthlyReport).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      run: {
        status: "failed",
        failureCode: "MONTHLY_REVIEW_FAILED",
      },
      check: { run: { status: "running" } },
      dueMeasurements: null,
      report: null,
      warnings: ["PRIORITY_PAGE_CHECK_RUNNING"],
    });
  });

  it("keeps due overflow useful but marks the envelope partial", async () => {
    due.getDueMeasurements.mockResolvedValue({
      scanState: "overflow",
      items: [],
      hasMore: true,
    });
    await expect(
      GrowthMonthlyReviewService.runMonthlyReview(
        "project_authorized",
        "user_authorized",
        request,
        now,
      ),
    ).resolves.toMatchObject({
      run: { status: "completed_with_errors" },
      dueMeasurements: { scanState: "overflow", items: [] },
      warnings: ["DUE_MEASUREMENTS_OVERFLOW"],
    });
  });

  it("continues to the report when the due scan throws without exposing its error", async () => {
    due.getDueMeasurements.mockRejectedValue(new Error("RAW_DATABASE_SECRET"));
    const result = await GrowthMonthlyReviewService.runMonthlyReview(
      "project_authorized",
      "user_authorized",
      request,
      now,
    );
    expect(reports.buildGrowthMonthlyReport).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      run: { status: "completed_with_errors" },
      dueMeasurements: null,
      report: { state: "no_activity" },
      warnings: ["DUE_MEASUREMENTS_FAILED"],
    });
    expect(JSON.stringify(result)).not.toContain("RAW_DATABASE_SECRET");
  });

  it.each([
    {
      label: "ready result",
      report: {
        state: "ready",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        reportTimezone: "Europe/London",
      },
    },
    {
      label: "period mismatch",
      report: {
        ...noActivity,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
      },
    },
    {
      label: "timezone mismatch",
      report: { ...noActivity, reportTimezone: "UTC" },
    },
  ])("treats a returned $label as report drift", async ({ report }) => {
    reports.buildGrowthMonthlyReport.mockResolvedValue(report);
    await expect(
      GrowthMonthlyReviewService.runMonthlyReview(
        "project_authorized",
        "user_authorized",
        request,
        now,
      ),
    ).resolves.toMatchObject({
      run: { status: "completed_with_errors" },
      report: null,
      warnings: ["MONTHLY_REPORT_DRIFT"],
    });
  });

  it("marks a report exception partial when earlier phases are useful", async () => {
    reports.buildGrowthMonthlyReport.mockRejectedValue(
      new Error("RAW_REPORT_SECRET"),
    );
    const result = await GrowthMonthlyReviewService.runMonthlyReview(
      "project_authorized",
      "user_authorized",
      request,
      now,
    );
    expect(result).toMatchObject({
      run: { status: "completed_with_errors" },
      report: null,
      warnings: ["MONTHLY_REPORT_FAILED"],
    });
    expect(JSON.stringify(result)).not.toContain("RAW_REPORT_SECRET");
  });

  it("fails with static parent details when no phase is useful", async () => {
    check.runCheck.mockRejectedValue(new Error("RAW_CHECK_SECRET"));
    due.getDueMeasurements.mockRejectedValue(new Error("RAW_DUE_SECRET"));
    reports.buildGrowthMonthlyReport.mockRejectedValue(
      new Error("RAW_REPORT_SECRET"),
    );

    const result = await GrowthMonthlyReviewService.runMonthlyReview(
      "project_authorized",
      "user_authorized",
      request,
      now,
    );
    expect(runs.failRun).toHaveBeenCalledWith({
      projectId: "project_authorized",
      runId: "parent_run",
      failureCode: "MONTHLY_REVIEW_FAILED",
      failureMessage: "Monthly review could not complete any phase.",
    });
    expect(result).toMatchObject({
      run: {
        status: "failed",
        failureCode: "MONTHLY_REVIEW_FAILED",
        failureMessage: "Monthly review could not complete any phase.",
      },
      check: null,
      dueMeasurements: null,
      report: null,
      warnings: [
        "PRIORITY_PAGE_CHECK_FAILED",
        "DUE_MEASUREMENTS_FAILED",
        "MONTHLY_REPORT_FAILED",
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/RAW_(CHECK|DUE|REPORT)_SECRET/);
  });

  it("replaces terminal transition errors with a static internal failure", async () => {
    runs.completeRun.mockRejectedValue(new Error("RAW_TRANSITION_SECRET"));
    await expect(
      GrowthMonthlyReviewService.runMonthlyReview(
        "project_authorized",
        "user_authorized",
        request,
        now,
      ),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Monthly review finalization failed",
    });
  });
});
