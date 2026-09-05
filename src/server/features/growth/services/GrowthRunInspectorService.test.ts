import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ listRecentRuns: vi.fn() }));
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

describe("GrowthRunInspectorService", () => {
  beforeEach(() => vi.resetAllMocks());

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
});
