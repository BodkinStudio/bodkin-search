import { beforeEach, describe, expect, it, vi } from "vitest";

const priority = vi.hoisted(() => ({ listPriorityRecommendations: vi.fn() }));
const decisions = vi.hoisted(() => ({ listActiveControllerSources: vi.fn() }));

vi.mock("./GrowthPriorityRecommendationsReadService", () => ({
  GrowthPriorityRecommendationsReadService: priority,
}));
vi.mock("../repositories/GrowthOpportunityDecisionsRepository", () => ({
  GrowthOpportunityDecisionsRepository: decisions,
}));

import { GrowthOpportunitiesService } from "./GrowthOpportunitiesService";

const recommendation = {
  id: "recommendation_1",
  title: "Improve pricing page",
  titleRedacted: false,
  titleTruncated: false,
  rationale: "Explain the proof.",
  rationaleRedacted: false,
  rationaleTruncated: false,
  category: "content",
  categoryRedacted: false,
  categoryTruncated: false,
  impact: 4,
  commercialRelevance: 5,
  effort: 2,
  urgency: 2,
  confidence: 0.8,
  priorityScore: 42,
  status: "proposed",
  reviewVersion: 0,
  snoozedUntil: null,
  reviewedAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  needsAction: false,
  targetCount: 0,
  displayTargets: [],
  displayTargetsOmitted: false,
  displayTargetsWithheld: false,
  stepCount: 0,
  displaySteps: [],
  displayStepsOmitted: false,
} as const;

beforeEach(() => {
  vi.resetAllMocks();
  priority.listPriorityRecommendations.mockResolvedValue({
    recommendations: [recommendation],
    limit: 20,
    hasMore: false,
    nextCursor: null,
  });
  decisions.listActiveControllerSources.mockResolvedValue([
    { recommendationId: "recommendation_1", signalId: "signal_1" },
    { recommendationId: "foreign_recommendation", signalId: "foreign_signal" },
  ]);
});

describe("GrowthOpportunitiesService", () => {
  it("composes the safe priority page with only its bounded controller signal", async () => {
    await expect(
      GrowthOpportunitiesService.listOpportunities("project_authorized"),
    ).resolves.toEqual({
      recommendations: [
        { recommendation, reviewSource: { signalId: "signal_1" } },
      ],
      limit: 20,
      hasMore: false,
      nextCursor: null,
    });
    expect(priority.listPriorityRecommendations).toHaveBeenCalledWith({
      projectId: "project_authorized",
      limit: 20,
    });
    expect(decisions.listActiveControllerSources).toHaveBeenCalledWith(
      "project_authorized",
      ["recommendation_1"],
    );
  });

  it("keeps recommendations without an active controller read-only", async () => {
    decisions.listActiveControllerSources.mockResolvedValue([]);
    const page =
      await GrowthOpportunitiesService.listOpportunities("project_1");
    expect(page.recommendations[0]?.reviewSource).toBeNull();
    expect(JSON.stringify(page)).not.toContain("runId");
    expect(JSON.stringify(page)).not.toContain("relationship");
  });
});
