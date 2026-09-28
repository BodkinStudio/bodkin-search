import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGrowthInsightSchema,
  createGrowthRecommendationSchema,
  reviewGrowthRecommendationSchema,
} from "@/types/schemas/growth";

const repository = vi.hoisted(() => ({
  getInsight: vi.fn(),
  getInsightGraph: vi.fn(),
  getRecommendation: vi.fn(),
  getRecommendationGraph: vi.fn(),
  getInsightByKey: vi.fn(),
  getRecommendationByKey: vi.fn(),
  projectDomain: vi.fn(),
  signalIdsInRun: vi.fn(),
  insightIdsInRun: vi.fn(),
  runState: vi.fn(),
  createInsightGraph: vi.fn(),
  createRecommendationGraph: vi.fn(),
  recommendationDestination: vi.fn(),
  compareAndSetRecommendationReview: vi.fn(),
}));

vi.mock("../repositories/GrowthInsightsRepository", () => ({
  GrowthInsightsRepository: repository,
}));

import { GrowthInsightsService } from "./GrowthInsightsService";

const insightInput = createGrowthInsightSchema.parse({
  projectId: "project_1",
  runId: "run_1",
  creationKey: "traffic-loss",
  title: "Traffic loss on pricing",
  explanation: "Clicks fell against the comparison period.",
  hypothesis: "The pricing page lost visibility.",
  confidence: 0.8,
  signalIds: ["signal_2", "signal_1", "signal_1"],
  model: "test-model",
  promptVersion: "v1",
});

const recommendationInput = createGrowthRecommendationSchema.parse({
  projectId: "project_1",
  runId: "run_1",
  creationKey: "repair-pricing",
  title: "Repair pricing visibility",
  rationale: "The page has commercial value and measurable demand.",
  category: "content",
  insightIds: ["insight_2", "insight_1", "insight_1"],
  impact: 5,
  commercialRelevance: 5,
  effort: 2,
  urgency: 3,
  confidence: 0.75,
  priorityScore: 10,
  targets: [
    { type: "url", value: "https://WWW.Example.com/Pricing/?utm=one#top" },
    { type: "keyword", value: "  High   Intent  " },
    { type: "site", value: "shop.example.com/ignored" },
    { type: "url", value: "example.com/Pricing/" },
    { type: "cluster", value: "  Product   Pages " },
  ],
  steps: [" Rewrite   the introduction ", "Add proof points"],
  model: "test-model",
  promptVersion: "v1",
});

const recommendationRow = {
  id: "recommendation_1",
  projectId: "project_1",
  runId: "run_1",
  creationKey: "repair-pricing",
  factHash: "a".repeat(64),
  title: "Repair pricing visibility",
  rationale: "The page has commercial value and measurable demand.",
  category: "content",
  impact: 5,
  commercialRelevance: 5,
  effort: 2,
  urgency: 3,
  confidence: 0.75,
  priorityScore: 10,
  model: "test-model",
  promptVersion: "v1",
  status: "proposed" as const,
  reviewVersion: 0,
  snoozedUntil: null,
  dismissalReason: null,
  resolutionRecommendationId: null,
  reviewedAt: null,
  createdAt: "2026-08-29T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  repository.runState.mockResolvedValue("running");
  repository.projectDomain.mockResolvedValue("example.com");
  repository.signalIdsInRun.mockImplementation(
    async (_projectId: string, _runId: string, ids: string[]) =>
      ids.map((id) => ({ id })),
  );
  repository.insightIdsInRun.mockImplementation(
    async (_projectId: string, _runId: string, ids: string[]) =>
      ids.map((id) => ({ id })),
  );
});

describe("GrowthInsightsService immutable graph creation", () => {
  it("returns the complete original Insight graph for reordered exact retries", async () => {
    const graph = {
      insight: {
        id: "insight_1",
        ...insightInput,
        factHash: "",
        createdAt: "2026-08-29T10:00:00.000Z",
      },
      signalIds: ["signal_1", "signal_2"],
    };
    repository.getInsightByKey.mockResolvedValueOnce(null);
    repository.createInsightGraph.mockImplementation(
      async (write: { factHash: string }) => {
        graph.insight.factHash = write.factHash;
      },
    );
    repository.getInsightByKey.mockImplementation(async () => graph.insight);
    repository.getInsightGraph.mockResolvedValue(graph);

    await expect(
      GrowthInsightsService.createInsight(insightInput),
    ).resolves.toBe(graph);
    await expect(
      GrowthInsightsService.createInsight({
        ...insightInput,
        signalIds: ["signal_1", "signal_2", "signal_1"],
      }),
    ).resolves.toBe(graph);

    expect(repository.createInsightGraph).toHaveBeenCalledTimes(1);
    expect(repository.createInsightGraph).toHaveBeenCalledWith(
      expect.objectContaining({ signalIds: ["signal_1", "signal_2"] }),
    );
    expect(repository.getInsightGraph).toHaveBeenLastCalledWith(
      "project_1",
      "run_1",
      "insight_1",
    );
  });

  it("never extends an occupied Insight graph when immutable content drifts", async () => {
    repository.getInsightByKey.mockResolvedValue({
      id: "insight_1",
      projectId: "project_1",
      runId: "run_1",
      creationKey: "traffic-loss",
      factHash: "different-fact",
    });

    await expect(
      GrowthInsightsService.createInsight({
        ...insightInput,
        signalIds: [...insightInput.signalIds, "losing_signal"],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.createInsightGraph).not.toHaveBeenCalled();
  });

  it("treats omitted and explicit-null Insight provenance as the same fact", async () => {
    const input = {
      ...insightInput,
      creationKey: "no-insight-provenance",
      model: undefined,
      promptVersion: undefined,
    };
    const graph = {
      insight: {
        id: "insight_without_provenance",
        projectId: input.projectId,
        runId: input.runId,
        factHash: "",
      },
      signalIds: input.signalIds,
    };
    repository.getInsightByKey.mockResolvedValueOnce(null);
    repository.createInsightGraph.mockImplementation(
      async (write: { factHash: string }) => {
        graph.insight.factHash = write.factHash;
      },
    );
    repository.getInsightByKey.mockImplementation(async () => graph.insight);
    repository.getInsightGraph.mockResolvedValue(graph);

    await GrowthInsightsService.createInsight(input);
    await expect(
      GrowthInsightsService.createInsight({
        ...input,
        model: null,
        promptVersion: null,
      }),
    ).resolves.toBe(graph);
    expect(repository.createInsightGraph).toHaveBeenCalledTimes(1);
  });

  it("hides missing, foreign, and cross-run Signal sources as NOT_FOUND", async () => {
    repository.getInsightByKey.mockResolvedValue(null);
    repository.signalIdsInRun.mockResolvedValue([{ id: "signal_1" }]);

    await expect(
      GrowthInsightsService.createInsight(insightInput),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.signalIdsInRun).toHaveBeenCalledWith(
      "project_1",
      "run_1",
      ["signal_1", "signal_2"],
    );
    expect(repository.createInsightGraph).not.toHaveBeenCalled();
  });

  it("returns the complete original Recommendation graph after deterministic normalization", async () => {
    const graph = {
      recommendation: { ...recommendationRow, factHash: "" },
      insightIds: ["insight_1", "insight_2"],
      targets: [
        { targetType: "cluster", targetValue: "product pages" },
        { targetType: "keyword", targetValue: "high intent" },
        { targetType: "site", targetValue: "shop.example.com" },
        { targetType: "url", targetValue: "https://example.com/Pricing" },
      ],
      steps: [
        { position: 0, content: "Rewrite the introduction" },
        { position: 1, content: "Add proof points" },
      ],
    };
    repository.getRecommendationByKey.mockResolvedValueOnce(null);
    repository.createRecommendationGraph.mockImplementation(
      async (write: { factHash: string }) => {
        graph.recommendation.factHash = write.factHash;
      },
    );
    repository.getRecommendationByKey.mockImplementation(
      async () => graph.recommendation,
    );
    repository.getRecommendationGraph.mockResolvedValue(graph);

    await expect(
      GrowthInsightsService.createRecommendation(recommendationInput),
    ).resolves.toBe(graph);
    await expect(
      GrowthInsightsService.createRecommendation({
        ...recommendationInput,
        insightIds: ["insight_1", "insight_2", "insight_1"],
        targets: recommendationInput.targets.toReversed(),
      }),
    ).resolves.toBe(graph);

    expect(repository.createRecommendationGraph).toHaveBeenCalledTimes(1);
    expect(repository.createRecommendationGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        insightIds: ["insight_1", "insight_2"],
        targets: graph.targets,
        steps: graph.steps,
      }),
    );
  });

  it("rejects off-project targets before writing any Recommendation rows", async () => {
    repository.getRecommendationByKey.mockResolvedValue(null);

    await expect(
      GrowthInsightsService.createRecommendation({
        ...recommendationInput,
        targets: [{ type: "url", value: "https://competitor.com/pricing" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.createRecommendationGraph).not.toHaveBeenCalled();
  });

  it("treats omitted and explicit-null Recommendation provenance as the same fact", async () => {
    const input = {
      ...recommendationInput,
      creationKey: "no-recommendation-provenance",
      model: undefined,
      promptVersion: undefined,
    };
    const graph = {
      recommendation: {
        ...recommendationRow,
        id: "recommendation_without_provenance",
        creationKey: input.creationKey,
        factHash: "",
      },
      insightIds: input.insightIds,
      targets: [
        { targetType: "cluster", targetValue: "product pages" },
        { targetType: "keyword", targetValue: "high intent" },
        { targetType: "site", targetValue: "shop.example.com" },
        { targetType: "url", targetValue: "https://example.com/Pricing" },
      ],
      steps: [
        { position: 0, content: "Rewrite the introduction" },
        { position: 1, content: "Add proof points" },
      ],
    };
    repository.getRecommendationByKey.mockResolvedValueOnce(null);
    repository.createRecommendationGraph.mockImplementation(
      async (write: { factHash: string }) => {
        graph.recommendation.factHash = write.factHash;
      },
    );
    repository.getRecommendationByKey.mockImplementation(
      async () => graph.recommendation,
    );
    repository.getRecommendationGraph.mockResolvedValue(graph);

    await GrowthInsightsService.createRecommendation(input);
    await expect(
      GrowthInsightsService.createRecommendation({
        ...input,
        model: null,
        promptVersion: null,
      }),
    ).resolves.toBe(graph);
    expect(repository.createRecommendationGraph).toHaveBeenCalledTimes(1);
  });

  it("hides missing, foreign, and cross-run Insight sources as NOT_FOUND", async () => {
    repository.getRecommendationByKey.mockResolvedValue(null);
    repository.insightIdsInRun.mockResolvedValue([{ id: "insight_1" }]);

    await expect(
      GrowthInsightsService.createRecommendation(recommendationInput),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.insightIdsInRun).toHaveBeenCalledWith(
      "project_1",
      "run_1",
      ["insight_1", "insight_2"],
    );
    expect(repository.createRecommendationGraph).not.toHaveBeenCalled();
  });

  it("does not expose a foreign Recommendation during review", async () => {
    repository.getRecommendation.mockResolvedValue(null);
    const input = reviewGrowthRecommendationSchema.parse({
      projectId: "project_2",
      recommendationId: "recommendation_1",
      expectedStatus: "proposed",
      expectedVersion: 0,
      status: "accepted",
    });

    await expect(
      GrowthInsightsService.reviewRecommendation(input),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.getRecommendation).toHaveBeenCalledWith(
      "project_2",
      "recommendation_1",
    );
    expect(repository.compareAndSetRecommendationReview).not.toHaveBeenCalled();
  });
});
