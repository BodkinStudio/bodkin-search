import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listMeasurementPlansPage: vi.fn(),
  listMetricsForMeasurementPlans: vi.fn(),
  listResultsForMeasurementPlans: vi.fn(),
}));
vi.mock("../repositories/GrowthMeasurementsReadRepository", () => ({
  GrowthMeasurementsReadRepository: repo,
}));
import { GrowthMeasurementsReadService } from "./GrowthMeasurementsReadService";

const root = {
  id: "plan_1",
  actionId: "action_1",
  status: "completed" as const,
  actionVersion: 3,
  anchorAt: "2026-01-01T00:00:00.000Z",
  anchorDate: "2026-01-01",
  reportTimezone: "Europe/London",
  baselineStart: "2025-12-01",
  baselineEnd: "2025-12-31",
  cooldownEnd: "2026-01-01",
  measurementStart: "2026-01-02",
  measurementEnd: "2026-01-31",
  longMeasurementEnd: null,
  comparisonMode: "preceding_period" as const,
  completedAt: "2026-02-01T00:00:00.000Z",
  createdAt: "2026-01-01 00:00:00",
  actionTitle:
    "Contact team@example.com about https://secret.test/path; api_key=action-secret-1234",
  actionStatus: "evaluated" as const,
  actionStateVersion: 4,
};

beforeEach(() => {
  vi.resetAllMocks();
  repo.listMeasurementPlansPage.mockResolvedValue([root]);
  repo.listMetricsForMeasurementPlans.mockResolvedValue([
    { measurementPlanId: "plan_1", isPrimary: true },
  ]);
  repo.listResultsForMeasurementPlans.mockResolvedValue([
    {
      measurementPlanId: "plan_1",
      outcome: "positive",
      confidence: 0.8,
      summary:
        "Discussed with owner@example.com at https://secret.test using Bearer result-secret-123456789",
      evaluatedAt: "2026-02-01T00:00:00.000Z",
    },
  ]);
});

describe("GrowthMeasurementsReadService", () => {
  it("uses root-first bounded reads and projects a non-causal current saved card", async () => {
    const page = await GrowthMeasurementsReadService.listMeasurements({
      projectId: "project_1",
      limit: 20,
    });
    expect(repo.listMeasurementPlansPage).toHaveBeenCalledWith({
      projectId: "project_1",
      limit: 20,
    });
    expect(repo.listMetricsForMeasurementPlans).toHaveBeenCalledWith(
      "project_1",
      ["plan_1"],
    );
    expect(page.measurements[0]).toMatchObject({
      id: "plan_1",
      createdAt: "2026-01-01T00:00:00.000Z",
      actionLifecycle: "aligned",
      metricCount: 1,
      primaryMetricCount: 1,
      dueDate: "2026-01-31",
      result: { outcome: "positive", evaluatedAt: "2026-02-01T00:00:00.000Z" },
    });
    expect(page.measurements[0]?.actionTitle).not.toContain("team@example.com");
    expect(page.measurements[0]?.actionTitle).not.toContain(
      "https://secret.test",
    );
    expect(page.measurements[0]?.actionTitle).not.toContain(
      "action-secret-1234",
    );
    expect(page.measurements[0]?.result?.summary).not.toContain(
      "owner@example.com",
    );
    expect(page.measurements[0]?.result?.summary).not.toContain(
      "https://secret.test",
    );
    expect(page.measurements[0]?.result?.summary).not.toContain(
      "result-secret-123456789",
    );
  });

  it("rejects invalid stored Plan lifecycle data", async () => {
    repo.listResultsForMeasurementPlans.mockResolvedValue([]);
    await expect(
      GrowthMeasurementsReadService.listMeasurements({
        projectId: "project_1",
        limit: 20,
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("keeps Action drift explicit", async () => {
    repo.listMeasurementPlansPage.mockResolvedValue([
      { ...root, actionStatus: "measuring", actionStateVersion: 3 },
    ]);
    const page = await GrowthMeasurementsReadService.listMeasurements({
      projectId: "project_1",
      limit: 20,
    });
    expect(page.measurements[0]?.actionLifecycle).toBe("inconsistent");
  });

  it("uses only emitted roots for child reads and gives a continuation cursor", async () => {
    repo.listMeasurementPlansPage.mockResolvedValue([
      root,
      { ...root, id: "plan_2", actionId: "action_2" },
    ]);
    const page = await GrowthMeasurementsReadService.listMeasurements({
      projectId: "project_1",
      limit: 1,
    });
    expect(repo.listMetricsForMeasurementPlans).toHaveBeenCalledWith(
      "project_1",
      ["plan_1"],
    );
    expect(page).toMatchObject({
      hasMore: true,
      nextCursor: { createdAt: "2026-01-01T00:00:00.000Z", id: "plan_1" },
    });
  });

  it("returns an empty final page without child reads", async () => {
    repo.listMeasurementPlansPage.mockResolvedValue([]);
    await expect(
      GrowthMeasurementsReadService.listMeasurements({
        projectId: "project_1",
        limit: 20,
      }),
    ).resolves.toEqual({
      measurements: [],
      limit: 20,
      hasMore: false,
      nextCursor: null,
    });
    expect(repo.listMetricsForMeasurementPlans).toHaveBeenCalledWith(
      "project_1",
      [],
    );
  });

  it.each([
    [
      "active with a Result",
      {
        ...root,
        status: "active",
        completedAt: null,
        actionStatus: "measuring",
        actionStateVersion: 3,
      },
      undefined,
      [
        {
          measurementPlanId: "plan_1",
          outcome: "positive",
          confidence: 0.8,
          summary: "result",
          evaluatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    ],
    ["completed without a Result", root, undefined, []],
    [
      "completed with a mismatched Result evaluation time",
      root,
      undefined,
      [
        {
          measurementPlanId: "plan_1",
          outcome: "positive",
          confidence: 0.8,
          summary: "mismatched",
          evaluatedAt: "2026-02-02T00:00:00.000Z",
        },
      ],
    ],
    [
      "duplicate Results",
      root,
      undefined,
      [
        {
          measurementPlanId: "plan_1",
          outcome: "positive",
          confidence: 0.8,
          summary: "one",
          evaluatedAt: "2026-02-01T00:00:00.000Z",
        },
        {
          measurementPlanId: "plan_1",
          outcome: "positive",
          confidence: 0.8,
          summary: "two",
          evaluatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    ],
    ["zero Metrics", root, [], undefined],
    [
      "51 Metrics",
      root,
      Array.from({ length: 51 }, () => ({
        measurementPlanId: "plan_1",
        isPrimary: true,
      })),
      undefined,
    ],
    [
      "no primary Metric",
      root,
      [{ measurementPlanId: "plan_1", isPrimary: false }],
      undefined,
    ],
  ])(
    "rejects %s",
    async (_name, invalidRoot, invalidMetrics, invalidResults) => {
      repo.listMeasurementPlansPage.mockResolvedValue([invalidRoot]);
      if (invalidMetrics)
        repo.listMetricsForMeasurementPlans.mockResolvedValue(invalidMetrics);
      if (invalidResults)
        repo.listResultsForMeasurementPlans.mockResolvedValue(invalidResults);
      await expect(
        GrowthMeasurementsReadService.listMeasurements({
          projectId: "project_1",
          limit: 20,
        }),
      ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    },
  );

  it("marks an active Plan aligned and prefers its long-window due date", async () => {
    repo.listMeasurementPlansPage.mockResolvedValue([
      {
        ...root,
        status: "active",
        completedAt: null,
        actionStatus: "measuring",
        actionStateVersion: 3,
        longMeasurementEnd: "2026-02-28",
      },
    ]);
    repo.listResultsForMeasurementPlans.mockResolvedValue([]);
    const page = await GrowthMeasurementsReadService.listMeasurements({
      projectId: "project_1",
      limit: 20,
    });
    expect(page.measurements[0]).toMatchObject({
      actionLifecycle: "aligned",
      dueDate: "2026-02-28",
      result: null,
    });
  });
});
