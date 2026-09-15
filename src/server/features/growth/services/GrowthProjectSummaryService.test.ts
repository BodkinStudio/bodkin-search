import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listUnresolvedRecommendations: vi.fn(),
  listCurrentActions: vi.fn(),
  listRecentSignals: vi.fn(),
  listSignalFreshness: vi.fn(),
  getLatestRun: vi.fn(),
}));
const settings = vi.hoisted(() => ({ getSettings: vi.fn() }));
const context = vi.hoisted(() => ({ getProjectContext: vi.fn() }));
const dueMeasurements = vi.hoisted(() => ({ getDueMeasurements: vi.fn() }));
vi.mock("../repositories/GrowthProjectSummaryRepository", () => ({
  GrowthProjectSummaryRepository: repository,
}));
vi.mock("./GrowthSettingsService", () => ({ GrowthSettingsService: settings }));
vi.mock("./GrowthDueMeasurementsService", () => ({
  GrowthDueMeasurementsService: dueMeasurements,
}));
vi.mock(
  "@/server/features/project-context/services/ProjectContextService",
  () => ({ getProjectContext: context.getProjectContext }),
);

import { GrowthProjectSummaryService } from "./GrowthProjectSummaryService";

const now = new Date("2026-09-01T00:30:00.000Z");
const project = {
  id: "project_1",
  name: "Example",
  domain: "example.com",
  locationCode: 284,
  languageCode: "en",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function mockOverflowCollections() {
  repository.listUnresolvedRecommendations.mockResolvedValue(
    Array.from({ length: 6 }, (_, index) => ({
      id: `recommendation_${index}`,
      title: `Recommendation ${index}`,
      rationale: "Why this matters",
      category: "content",
      impact: 5,
      commercialRelevance: 4,
      effort: 2,
      urgency: 2,
      confidence: 1,
      priorityScore: 10 - index,
      status: "proposed",
      snoozedUntil: null,
      createdAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    })),
  );
  repository.listCurrentActions.mockResolvedValue(
    Array.from({ length: 6 }, (_, index) => ({
      id: `action_${index}`,
      title: `Action ${index}`,
      category: "content",
      priorityScore: 10 - index,
      status: "ready",
      stateVersion: 1,
      dueAt: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      updatedAt: "2026-08-31T00:00:00.000Z",
    })),
  );
  repository.listRecentSignals.mockResolvedValue(
    Array.from({ length: 6 }, (_, index) => ({
      id: `signal_${index}`,
      signalType: "traffic_change",
      entityType: "site",
      metric: "search_clicks",
      severity: "warning",
      confidence: 1,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      baselineValue: 10,
      currentValue: 9,
      deltaValue: -1,
      deltaPercent: -10,
      evidenceKind: "gsc_period",
      capturedAt: `2026-08-${String(31 - index).padStart(2, "0")}T00:00:00.000Z`,
      runStatus: "completed",
    })),
  );
}

describe("GrowthProjectSummaryService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    settings.getSettings.mockResolvedValue({
      growthEnabled: true,
      reportTimezone: "UTC",
      reportCadence: "monthly",
      reportDay: 1,
      defaultBaselineDays: 28,
      defaultCooldownDays: 7,
      defaultPrimaryWindowDays: 28,
      defaultLongWindowDays: 55,
      persisted: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    context.getProjectContext.mockResolvedValue({
      sections: [],
      missingSections: [
        "business_overview",
        "current_goal",
        "positioning",
        "writing_preferences",
      ],
      customSections: [],
      competitors: [],
      keyPages: [],
      researchLog: [],
    });
    repository.listUnresolvedRecommendations.mockResolvedValue([]);
    repository.listCurrentActions.mockResolvedValue([]);
    repository.listRecentSignals.mockResolvedValue([]);
    repository.listSignalFreshness.mockResolvedValue([]);
    repository.getLatestRun.mockResolvedValue(null);
    dueMeasurements.getDueMeasurements.mockResolvedValue({
      scanState: "complete",
      items: [],
      hasMore: false,
    });
  });

  it("uses one injected asOf for every saved-signal read and exposes no internal facts", async () => {
    const summary = await GrowthProjectSummaryService.getProjectSummary(
      project,
      { now },
    );
    expect(repository.listRecentSignals).toHaveBeenCalledWith(
      project.id,
      now.toISOString(),
      6,
    );
    expect(repository.listSignalFreshness).toHaveBeenCalledWith(
      project.id,
      now.toISOString(),
    );
    expect(repository.getLatestRun).toHaveBeenCalledWith(
      project.id,
      now.toISOString(),
    );
    expect(JSON.stringify(summary)).not.toContain("entityRef");
    expect(summary.project.url).toEqual({
      value: "https://example.com/",
      queryOrFragmentOmitted: false,
      withheld: false,
    });
  });

  it("turns each sixth repository row into truthful collection overflow", async () => {
    mockOverflowCollections();

    const summary = await GrowthProjectSummaryService.getProjectSummary(
      project,
      { now },
    );

    expect(summary.unresolvedRecommendations.hasMore).toBe(true);
    expect(summary.unresolvedRecommendations.items[0]).toMatchObject({
      id: "recommendation_0",
    });
    expect(summary.unresolvedRecommendations.items).toHaveLength(5);
    expect(summary.currentActions.hasMore).toBe(true);
    expect(summary.currentActions.items[0]).toMatchObject({ id: "action_0" });
    expect(summary.currentActions.items).toHaveLength(5);
    expect(summary.recentSignals.hasMore).toBe(true);
    expect(summary.recentSignals.items[0]).toMatchObject({ id: "signal_0" });
    expect(summary.recentSignals.items).toHaveLength(5);
  });

  it("delegates the due-Measurement policy with the same project and captured clock", async () => {
    dueMeasurements.getDueMeasurements.mockResolvedValue({
      scanState: "overflow",
      items: [],
      hasMore: true,
    });
    const summary = await GrowthProjectSummaryService.getProjectSummary(
      project,
      { now },
    );
    expect(dueMeasurements.getDueMeasurements).toHaveBeenCalledWith(
      project.id,
      { now },
    );
    expect(summary.dueMeasurements).toEqual({
      scanState: "overflow",
      items: [],
      hasMore: true,
    });
  });

  it("redacts credentials and reapplies public caps after Unicode URL projection", async () => {
    const privateProject = {
      ...project,
      name: `api_key=PROJECT_SUMMARY_SECRET ${"é".repeat(200)}`,
      domain: "user:password@example.com/private",
    };
    repository.listUnresolvedRecommendations.mockResolvedValue([
      {
        id: "rec",
        title: `https://e.co/${"é".repeat(48)}`,
        rationale: "person@example.com",
        category: "content",
        impact: 5,
        commercialRelevance: 5,
        effort: 2,
        urgency: 2,
        confidence: 1,
        priorityScore: 1,
        status: "proposed",
        snoozedUntil: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
    const summary = await GrowthProjectSummaryService.getProjectSummary(
      privateProject,
      { now },
    );
    expect(summary.project.name).toMatchObject({ redacted: true });
    expect(summary.project.url).toMatchObject({ value: null, withheld: true });
    expect(summary.unresolvedRecommendations.items[0]).toMatchObject({
      title: { truncated: true },
      rationale: { value: "[email omitted]", redacted: true },
    });
    expect(summary.unresolvedRecommendations.items[0].title.value).toHaveLength(
      300,
    );
    expect(JSON.stringify(summary)).not.toContain("PROJECT_SUMMARY_SECRET");
  });

  it("fails closed when a repository violates the Signal cutoff contract", async () => {
    repository.listRecentSignals.mockResolvedValue([
      {
        id: "future_signal",
        signalType: "traffic_change",
        entityType: "site",
        metric: "search_clicks",
        severity: "warning",
        confidence: 1,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        baselineValue: 1,
        currentValue: 2,
        deltaValue: 1,
        deltaPercent: 100,
        evidenceKind: "gsc_period",
        capturedAt: "2026-09-01T00:30:00.001Z",
        runStatus: "completed",
      },
    ]);

    await expect(
      GrowthProjectSummaryService.getProjectSummary(project, { now }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("fails closed when a freshness aggregate violates the cutoff contract", async () => {
    repository.listSignalFreshness.mockResolvedValue([
      {
        evidenceKind: "gsc_period",
        capturedAt: "2026-09-01T00:30:00.001Z",
      },
    ]);

    await expect(
      GrowthProjectSummaryService.getProjectSummary(project, { now }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
