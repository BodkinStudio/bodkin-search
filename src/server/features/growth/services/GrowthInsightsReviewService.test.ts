import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewGrowthRecommendationSchema } from "@/types/schemas/growth";

const repository = vi.hoisted(() => ({
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

beforeEach(() => vi.clearAllMocks());

describe("GrowthInsightsService Recommendation review", () => {
  it.each([
    ["accepted", {}],
    ["dismissed", { dismissalReason: "insufficient_evidence" }],
    ["snoozed", { snoozedUntil: "2099-01-01T00:00:00.000Z" }],
    ["merged", { resolutionRecommendationId: "recommendation_2" }],
    ["superseded", { resolutionRecommendationId: "recommendation_2" }],
  ] as const)(
    "reviews proposed Recommendations as %s",
    async (status, metadata) => {
      repository.getRecommendation.mockResolvedValue(recommendationRow);
      repository.recommendationDestination.mockResolvedValue({
        ...recommendationRow,
        id: "recommendation_2",
      });
      const updated = {
        ...recommendationRow,
        ...metadata,
        status,
        reviewVersion: 1,
        reviewedAt: "2026-08-29T11:00:00.000Z",
      };
      repository.compareAndSetRecommendationReview.mockResolvedValue(updated);
      const input = reviewGrowthRecommendationSchema.parse({
        projectId: "project_1",
        recommendationId: "recommendation_1",
        expectedStatus: "proposed",
        expectedVersion: 0,
        status,
        ...metadata,
      });

      await expect(
        GrowthInsightsService.reviewRecommendation(input),
      ).resolves.toEqual(updated);
      expect(repository.compareAndSetRecommendationReview).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project_1",
          recommendationId: "recommendation_1",
          expectedStatus: "proposed",
          expectedVersion: 0,
          status,
          dismissalReason:
            "dismissalReason" in metadata ? metadata.dismissalReason : null,
          snoozedUntil:
            "snoozedUntil" in metadata ? metadata.snoozedUntil : null,
          resolutionRecommendationId:
            "resolutionRecommendationId" in metadata
              ? metadata.resolutionRecommendationId
              : null,
        }),
      );
    },
  );

  it("returns a snoozed Recommendation to proposed and clears review metadata", async () => {
    const snoozed = {
      ...recommendationRow,
      status: "snoozed" as const,
      reviewVersion: 1,
      snoozedUntil: "2099-01-01T00:00:00.000Z",
      reviewedAt: "2026-08-29T11:00:00.000Z",
    };
    repository.getRecommendation.mockResolvedValue(snoozed);
    repository.compareAndSetRecommendationReview.mockResolvedValue({
      ...recommendationRow,
      reviewVersion: 2,
    });
    const input = reviewGrowthRecommendationSchema.parse({
      projectId: "project_1",
      recommendationId: "recommendation_1",
      expectedStatus: "snoozed",
      expectedVersion: 1,
      status: "proposed",
    });

    await GrowthInsightsService.reviewRecommendation(input);

    expect(repository.compareAndSetRecommendationReview).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "proposed",
        dismissalReason: null,
        snoozedUntil: null,
        resolutionRecommendationId: null,
        reviewedAt: null,
      }),
    );
  });

  it("returns an exact decision replay without issuing another update", async () => {
    const accepted = {
      ...recommendationRow,
      status: "accepted" as const,
      reviewVersion: 1,
      reviewedAt: "2026-08-29T11:00:00.000Z",
    };
    repository.getRecommendation.mockResolvedValue(accepted);
    const input = reviewGrowthRecommendationSchema.parse({
      projectId: "project_1",
      recommendationId: "recommendation_1",
      expectedStatus: "proposed",
      expectedVersion: 0,
      status: "accepted",
    });

    await expect(
      GrowthInsightsService.reviewRecommendation(input),
    ).resolves.toBe(accepted);
    expect(repository.compareAndSetRecommendationReview).not.toHaveBeenCalled();
  });

  it("replays an expired snooze but rejects it as a new transition", async () => {
    const expiredSnooze = "2000-01-01T00:00:00.000Z";
    const input = reviewGrowthRecommendationSchema.parse({
      projectId: "project_1",
      recommendationId: "recommendation_1",
      expectedStatus: "proposed",
      expectedVersion: 0,
      status: "snoozed",
      snoozedUntil: expiredSnooze,
    });
    const persisted = {
      ...recommendationRow,
      status: "snoozed" as const,
      reviewVersion: 1,
      snoozedUntil: expiredSnooze,
      reviewedAt: "1999-12-01T00:00:00.000Z",
    };
    repository.getRecommendation.mockResolvedValue(persisted);

    await expect(
      GrowthInsightsService.reviewRecommendation(input),
    ).resolves.toBe(persisted);
    expect(repository.compareAndSetRecommendationReview).not.toHaveBeenCalled();

    repository.getRecommendation.mockResolvedValue(recommendationRow);
    await expect(
      GrowthInsightsService.reviewRecommendation(input),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.compareAndSetRecommendationReview).not.toHaveBeenCalled();
  });

  it("rejects a matching outcome replay that names the wrong prior status", async () => {
    repository.getRecommendation.mockResolvedValue({
      ...recommendationRow,
      status: "accepted",
      reviewVersion: 1,
      reviewedAt: "2026-08-29T11:00:00.000Z",
    });
    const input = reviewGrowthRecommendationSchema.parse({
      projectId: "project_1",
      recommendationId: "recommendation_1",
      expectedStatus: "snoozed",
      expectedVersion: 0,
      status: "accepted",
    });

    await expect(
      GrowthInsightsService.reviewRecommendation(input),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.compareAndSetRecommendationReview).not.toHaveBeenCalled();
  });

  it("rejects stale matching metadata from a later review cycle", async () => {
    repository.getRecommendation.mockResolvedValue({
      ...recommendationRow,
      status: "snoozed",
      reviewVersion: 3,
      snoozedUntil: "2099-01-01T00:00:00.000Z",
    });
    const input = reviewGrowthRecommendationSchema.parse({
      projectId: "project_1",
      recommendationId: "recommendation_1",
      expectedStatus: "proposed",
      expectedVersion: 0,
      status: "snoozed",
      snoozedUntil: "2099-01-01T00:00:00.000Z",
    });

    await expect(
      GrowthInsightsService.reviewRecommendation(input),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.compareAndSetRecommendationReview).not.toHaveBeenCalled();
  });

  it("rejects different replays, illegal transitions, and lost CAS races", async () => {
    repository.getRecommendation.mockResolvedValue({
      ...recommendationRow,
      status: "accepted",
      reviewVersion: 1,
    });
    const differentReplay = reviewGrowthRecommendationSchema.parse({
      projectId: "project_1",
      recommendationId: "recommendation_1",
      expectedStatus: "proposed",
      expectedVersion: 0,
      status: "dismissed",
      dismissalReason: "duplicate",
    });
    await expect(
      GrowthInsightsService.reviewRecommendation(differentReplay),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const illegal = reviewGrowthRecommendationSchema.parse({
      projectId: "project_1",
      recommendationId: "recommendation_1",
      expectedStatus: "accepted",
      expectedVersion: 1,
      status: "accepted",
    });
    await expect(
      GrowthInsightsService.reviewRecommendation(illegal),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    repository.getRecommendation.mockResolvedValue(recommendationRow);
    repository.compareAndSetRecommendationReview.mockResolvedValue(null);
    const lostRace = reviewGrowthRecommendationSchema.parse({
      projectId: "project_1",
      recommendationId: "recommendation_1",
      expectedStatus: "proposed",
      expectedVersion: 0,
      status: "accepted",
    });
    await expect(
      GrowthInsightsService.reviewRecommendation(lostRace),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("requires a same-project/run, unresolved merge or supersede destination", async () => {
    repository.getRecommendation.mockResolvedValue(recommendationRow);
    repository.recommendationDestination.mockResolvedValueOnce(null);
    const input = reviewGrowthRecommendationSchema.parse({
      projectId: "project_1",
      recommendationId: "recommendation_1",
      expectedStatus: "proposed",
      expectedVersion: 0,
      status: "merged",
      resolutionRecommendationId: "recommendation_2",
    });

    await expect(
      GrowthInsightsService.reviewRecommendation(input),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.recommendationDestination).toHaveBeenCalledWith(
      "project_1",
      "run_1",
      "recommendation_2",
    );

    repository.recommendationDestination.mockResolvedValue({
      ...recommendationRow,
      id: "recommendation_2",
      status: "superseded",
    });
    await expect(
      GrowthInsightsService.reviewRecommendation(input),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repository.compareAndSetRecommendationReview).not.toHaveBeenCalled();
  });
});
