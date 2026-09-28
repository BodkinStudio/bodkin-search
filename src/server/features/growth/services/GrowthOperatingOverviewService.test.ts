import { beforeEach, describe, expect, it, vi } from "vitest";

const opportunities = vi.hoisted(() => ({ listOpportunities: vi.fn() }));
const actions = vi.hoisted(() => ({ listActions: vi.fn() }));
const due = vi.hoisted(() => ({ getDueMeasurements: vi.fn() }));
const measurements = vi.hoisted(() => ({ listMeasurements: vi.fn() }));
const reports = vi.hoisted(() => ({ getGrowthMonthlyReport: vi.fn() }));

vi.mock("./GrowthOpportunitiesService", () => ({
  GrowthOpportunitiesService: opportunities,
}));
vi.mock("./GrowthActionsReadService", () => ({
  GrowthActionsReadService: actions,
}));
vi.mock("./GrowthDueMeasurementsService", () => ({
  GrowthDueMeasurementsService: due,
}));
vi.mock("./GrowthMeasurementsReadService", () => ({
  GrowthMeasurementsReadService: measurements,
}));
vi.mock("./GrowthMonthlyReportsService", () => ({
  GrowthMonthlyReportsService: reports,
}));

import { GrowthOperatingOverviewService } from "./GrowthOperatingOverviewService";

const now = new Date("2026-09-02T10:00:00.000Z");

describe("GrowthOperatingOverviewService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    opportunities.listOpportunities.mockResolvedValue({
      recommendations: [],
      hasMore: false,
    });
    actions.listActions.mockResolvedValue({ actions: [], hasMore: false });
    due.getDueMeasurements.mockResolvedValue({
      scanState: "complete",
      items: [],
      hasMore: false,
    });
    measurements.listMeasurements.mockResolvedValue({
      measurements: [],
      hasMore: false,
    });
    reports.getGrowthMonthlyReport.mockResolvedValue({
      state: "ready",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      reportTimezone: "Europe/London",
    });
  });

  it("composes bounded saved state and excludes inconsistent outcomes", async () => {
    opportunities.listOpportunities.mockResolvedValue({
      recommendations: [{ id: "one" }, { id: "two" }],
      hasMore: true,
    });
    actions.listActions.mockResolvedValue({
      actions: [
        { status: "ready" },
        { status: "ready" },
        { status: "measuring" },
      ],
      hasMore: false,
    });
    due.getDueMeasurements.mockResolvedValue({
      scanState: "complete",
      items: [{ id: "plan_1" }],
      hasMore: true,
    });
    measurements.listMeasurements.mockResolvedValue({
      measurements: [
        {
          actionLifecycle: "aligned",
          result: { outcome: "positive" },
        },
        {
          actionLifecycle: "inconsistent",
          result: { outcome: "negative" },
        },
      ],
      hasMore: true,
    });
    reports.getGrowthMonthlyReport.mockResolvedValue({
      state: "report",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      reportTimezone: "Europe/London",
      report: { status: "published" },
    });

    const overview = await GrowthOperatingOverviewService.getOperatingOverview(
      "project_1",
      {
        now,
      },
    );

    expect(overview).toMatchObject({
      asOf: now.toISOString(),
      consistency: "current_not_snapshot",
      opportunities: { count: 2, hasMore: true },
      activeWork: {
        count: 3,
        hasMore: false,
        byStatus: { ready: 2, measuring: 1 },
      },
      dueMeasurements: { count: 1, hasMore: true, scanState: "complete" },
      evaluatedMeasurements: {
        count: 1,
        sourceHasMore: true,
        inconsistentCount: 1,
        byOutcome: { positive: 1, negative: 0 },
      },
      monthlySummary: {
        state: "published",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
      },
    });
    expect(due.getDueMeasurements).toHaveBeenCalledWith("project_1", { now });
    expect(reports.getGrowthMonthlyReport).toHaveBeenCalledWith(
      "project_1",
      { projectId: "project_1" },
      now,
    );
  });

  it("surfaces an overflowed due scan without inventing a count", async () => {
    due.getDueMeasurements.mockResolvedValue({
      scanState: "overflow",
      items: [],
      hasMore: true,
    });

    const overview = await GrowthOperatingOverviewService.getOperatingOverview(
      "project_1",
      {
        now,
      },
    );

    expect(overview.dueMeasurements).toEqual({
      count: null,
      hasMore: true,
      scanState: "overflow",
    });
  });
});
