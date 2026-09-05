import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listRecentRuns: vi.fn(),
  listRecentCalibrationRecommendations: vi.fn(),
  listRecentMonthlyCycles: vi.fn(),
}));
vi.mock("../repositories/GrowthRunInspectorRepository", () => ({
  GrowthRunInspectorRepository: repository,
}));

import { GrowthRunInspectorService } from "./GrowthRunInspectorService";

function row(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `run_${String(index).padStart(2, "0")}`,
    runType: "manual_analysis",
    trigger: "manual",
    status: "completed",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    startedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:01.500Z",
    detectorVersion: "detector-v1",
    analysisVersion: null,
    providerCostMinor: null,
    failureCode: null,
    failureMessage: null,
    signalCount: 1n,
    insightCount: "2",
    recommendationCount: 3,
    linkedActionCount: 4,
    ...overrides,
  };
}

function calibrationRow(
  index: number,
  status: string,
  dismissalReason: string | null = null,
  detectorVersion = "persistent-tracked-rank-drop-v1",
) {
  return {
    id: `recommendation_${index}`,
    detectorVersion,
    status,
    dismissalReason,
  };
}

describe("GrowthRunInspectorService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.listRecentCalibrationRecommendations.mockResolvedValue([]);
    repository.listRecentMonthlyCycles.mockResolvedValue([]);
  });

  it("normalizes counts and computes terminal and running durations", async () => {
    repository.listRecentRuns.mockResolvedValue([
      row(1),
      row(2, {
        status: "running",
        completedAt: null,
        startedAt: "2026-09-02T11:59:58.000Z",
      }),
    ]);
    await expect(
      GrowthRunInspectorService.getRunInspector(
        "project_1",
        new Date("2026-09-02T12:00:00.000Z"),
      ),
    ).resolves.toMatchObject({
      asOf: "2026-09-02T12:00:00.000Z",
      hasMore: false,
      calibration: {
        overall: {
          sampled: 0,
          classified: 0,
          classificationCoverage: null,
          falsePositiveRate: null,
        },
      },
      monthlyCycleEvidence: {
        distinctPeriods: 0,
        latestPeriodsAdjacent: null,
        cycles: [],
      },
      runs: [
        {
          durationMs: 1_500,
          entities: {
            signals: 1,
            insights: 2,
            recommendations: 3,
            linkedActions: 4,
          },
        },
        { durationMs: 2_000 },
      ],
    });
  });

  it("returns twenty rows and marks a cap-plus-one read", async () => {
    repository.listRecentRuns.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => row(index)),
    );
    const result = await GrowthRunInspectorService.getRunInspector(
      "project_1",
      new Date("2026-09-02T12:00:00.000Z"),
    );
    expect(repository.listRecentRuns).toHaveBeenCalledWith("project_1", 21);
    expect(
      repository.listRecentCalibrationRecommendations,
    ).toHaveBeenCalledWith(
      "project_1",
      expect.arrayContaining([
        "persistent-tracked-rank-drop-v1",
        "new-critical-audit-issue-v1",
      ]),
      201,
    );
    expect(result.runs).toHaveLength(20);
    expect(result.hasMore).toBe(true);
  });

  it("clamps a future running timestamp without returning a negative duration", async () => {
    repository.listRecentRuns.mockResolvedValue([
      row(1, {
        status: "running",
        completedAt: null,
        startedAt: "2026-09-03T00:00:00.000Z",
      }),
    ]);
    await expect(
      GrowthRunInspectorService.getRunInspector(
        "project_1",
        new Date("2026-09-02T12:00:00.000Z"),
      ),
    ).resolves.toMatchObject({ runs: [{ durationMs: 0 }] });
  });

  it("separates signal-quality false positives from other review outcomes", async () => {
    repository.listRecentRuns.mockResolvedValue([]);
    repository.listRecentCalibrationRecommendations.mockResolvedValue([
      calibrationRow(1, "accepted"),
      calibrationRow(2, "dismissed", "irrelevant"),
      calibrationRow(3, "dismissed", "insufficient_evidence"),
      calibrationRow(4, "dismissed", "wrong_diagnosis"),
      calibrationRow(5, "dismissed", "already_planned"),
      calibrationRow(6, "dismissed", "duplicate"),
      calibrationRow(7, "proposed"),
      calibrationRow(8, "snoozed"),
      calibrationRow(9, "merged", null, "new-critical-audit-issue-v1"),
      calibrationRow(10, "superseded", null, "new-critical-audit-issue-v1"),
    ]);
    const result = await GrowthRunInspectorService.getRunInspector(
      "project_1",
      new Date("2026-09-02T12:00:00.000Z"),
    );
    expect(result.calibration.overall).toMatchObject({
      sampled: 10,
      accepted: 1,
      signalQualityFalsePositives: 3,
      otherDismissals: 2,
      unresolved: 2,
      reconciled: 2,
      classified: 4,
      classificationCoverage: 0.4,
      falsePositiveRate: 0.75,
      dismissalReasons: {
        irrelevant: 1,
        insufficient_evidence: 1,
        wrong_diagnosis: 1,
        already_planned: 1,
        duplicate: 1,
      },
    });
    expect(result.calibration.detectors).toHaveLength(2);
  });

  it("caps calibration at two hundred and reports overflow", async () => {
    repository.listRecentRuns.mockResolvedValue([]);
    repository.listRecentCalibrationRecommendations.mockResolvedValue(
      Array.from({ length: 201 }, (_, index) =>
        calibrationRow(index, "accepted"),
      ),
    );
    const result = await GrowthRunInspectorService.getRunInspector(
      "project_1",
      new Date("2026-09-02T12:00:00.000Z"),
    );
    expect(result.calibration).toMatchObject({
      hasMore: true,
      overall: { sampled: 200, accepted: 200, classificationCoverage: 1 },
      detectors: [{ sampled: 200, classificationCoverage: 1 }],
    });
  });

  it("keeps repeated monthly rows while deriving distinct period continuity", async () => {
    repository.listRecentRuns.mockResolvedValue([]);
    repository.listRecentMonthlyCycles.mockResolvedValue([
      monthlyCycleRow("monthly_3", "2026-08-01", "2026-08-31"),
      monthlyCycleRow("monthly_2", "2026-08-01", "2026-08-31"),
      monthlyCycleRow("monthly_1", "2026-07-01", "2026-07-31", {
        childId: null,
        reportStatus: null,
      }),
    ]);
    const result = await GrowthRunInspectorService.getRunInspector(
      "project_1",
      new Date("2026-09-02T12:00:00.000Z"),
    );
    expect(repository.listRecentMonthlyCycles).toHaveBeenCalledWith(
      "project_1",
      expect.arrayContaining([
        "priority-page-click-decline-v1",
        "priority-page-click-decline-v2",
      ]),
      7,
    );
    expect(result.monthlyCycleEvidence).toMatchObject({
      distinctPeriods: 2,
      latestPeriodsAdjacent: true,
      cycles: [
        {
          parent: { id: "monthly_3" },
          recommendations: {
            accepted: 1,
            dismissed: 1,
            duplicateDismissals: 1,
            unresolved: 1,
            reconciled: 1,
          },
        },
        { parent: { id: "monthly_2" } },
        { child: null, report: null },
      ],
    });
  });

  it("caps monthly evidence and reports a gap between the latest periods", async () => {
    repository.listRecentRuns.mockResolvedValue([]);
    repository.listRecentMonthlyCycles.mockResolvedValue([
      monthlyCycleRow("monthly_7", "2026-08-01", "2026-08-31"),
      monthlyCycleRow("monthly_6", "2026-06-01", "2026-06-30"),
      monthlyCycleRow("monthly_5", "2026-05-01", "2026-05-31"),
      monthlyCycleRow("monthly_4", "2026-04-01", "2026-04-30"),
      monthlyCycleRow("monthly_3", "2026-03-01", "2026-03-31"),
      monthlyCycleRow("monthly_2", "2026-02-01", "2026-02-28"),
      monthlyCycleRow("monthly_1", "2026-01-01", "2026-01-31"),
    ]);
    const result = await GrowthRunInspectorService.getRunInspector(
      "project_1",
      new Date("2026-09-02T12:00:00.000Z"),
    );
    expect(result.monthlyCycleEvidence).toMatchObject({
      hasMore: true,
      distinctPeriods: 6,
      latestPeriodsAdjacent: false,
    });
    expect(result.monthlyCycleEvidence.cycles).toHaveLength(6);
  });
});

function monthlyCycleRow(
  parentId: string,
  periodStart: string,
  periodEnd: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    parentId,
    parentTrigger: "scheduled",
    parentStatus: "completed",
    parentPeriodStart: periodStart,
    parentPeriodEnd: periodEnd,
    parentStartedAt: "2026-09-01T00:00:00.000Z",
    parentCompletedAt: "2026-09-01T00:00:01.000Z",
    parentFailureCode: null,
    parentFailureMessage: null,
    childId: `${parentId}_child`,
    childTrigger: "scheduled",
    childStatus: "completed",
    childPeriodStart: periodStart,
    childPeriodEnd: periodEnd,
    childStartedAt: "2026-09-01T00:00:00.000Z",
    childCompletedAt: "2026-09-01T00:00:01.000Z",
    childFailureCode: null,
    childFailureMessage: null,
    reportStatus: "draft",
    reportTimezone: "UTC",
    reportDataCutoffAt: "2026-09-01T00:00:00.000Z",
    reportGeneratedAt: "2026-09-01T00:00:01.000Z",
    reportCreatedByType: "system",
    acceptedCount: 1,
    dismissedCount: 1,
    duplicateDismissalCount: 1,
    unresolvedCount: 1,
    reconciledCount: 1,
    ...overrides,
  };
}
