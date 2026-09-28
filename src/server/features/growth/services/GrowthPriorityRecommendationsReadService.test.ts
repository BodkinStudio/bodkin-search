import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listRecommendationsPage: vi.fn(),
  listTargetsForRecommendations: vi.fn(),
  listStepsForRecommendations: vi.fn(),
}));

vi.mock("../repositories/GrowthPriorityRecommendationsRepository", () => ({
  GrowthPriorityRecommendationsRepository: repository,
}));

import { GrowthPriorityRecommendationsReadService } from "./GrowthPriorityRecommendationsReadService";

const row = {
  id: "recommendation_1",
  title: "Improve pricing page",
  rationale: "Explain the commercial proof.",
  category: "content",
  impact: 4,
  commercialRelevance: 5,
  effort: 2,
  urgency: 2,
  confidence: 0.8,
  priorityScore: 42,
  status: "accepted",
  reviewVersion: 3,
  snoozedUntil: null,
  reviewedAt: "2026-08-21 09:00:00",
  createdAt: "2026-08-20 09:00:00",
} as const;

beforeEach(() => {
  vi.resetAllMocks();
  repository.listRecommendationsPage.mockResolvedValue([row]);
  repository.listTargetsForRecommendations.mockResolvedValue([]);
  repository.listStepsForRecommendations.mockResolvedValue([]);
});

describe("GrowthPriorityRecommendationsReadService", () => {
  it("reads roots first, then the two bulk child reads, and normalizes SQLite timestamps", async () => {
    const page =
      await GrowthPriorityRecommendationsReadService.listPriorityRecommendations(
        { projectId: "project_1", limit: 1 },
      );
    expect(repository.listRecommendationsPage).toHaveBeenCalledWith({
      projectId: "project_1",
      limit: 1,
    });
    expect(repository.listTargetsForRecommendations).toHaveBeenCalledWith(
      "project_1",
      ["recommendation_1"],
    );
    expect(repository.listStepsForRecommendations).toHaveBeenCalledWith(
      "project_1",
      ["recommendation_1"],
    );
    expect(page.recommendations[0]).toMatchObject({
      reviewVersion: 3,
      needsAction: true,
      createdAt: "2026-08-20T09:00:00.000Z",
      reviewedAt: "2026-08-21T09:00:00.000Z",
    });
  });

  it("returns a canonical cap-plus-one cursor and loads children only for emitted roots", async () => {
    repository.listRecommendationsPage.mockResolvedValue([
      row,
      {
        ...row,
        id: "recommendation_extra",
        status: "proposed",
        priorityScore: 40,
        reviewedAt: null,
        createdAt: "2026-08-19T09:00:00.000Z",
      },
    ]);

    const page =
      await GrowthPriorityRecommendationsReadService.listPriorityRecommendations(
        { projectId: "project_1", limit: 1 },
      );

    expect(page).toMatchObject({
      limit: 1,
      hasMore: true,
      nextCursor: {
        priorityScore: 42,
        createdAt: "2026-08-20T09:00:00.000Z",
        id: "recommendation_1",
      },
    });
    expect(repository.listTargetsForRecommendations).toHaveBeenCalledWith(
      "project_1",
      ["recommendation_1"],
    );
    expect(repository.listStepsForRecommendations).toHaveBeenCalledWith(
      "project_1",
      ["recommendation_1"],
    );
  });

  it("returns an empty final page without inventing a total", async () => {
    repository.listRecommendationsPage.mockResolvedValue([]);

    await expect(
      GrowthPriorityRecommendationsReadService.listPriorityRecommendations({
        projectId: "project_1",
        limit: 20,
      }),
    ).resolves.toEqual({
      recommendations: [],
      limit: 20,
      hasMore: false,
      nextCursor: null,
    });
    expect(repository.listTargetsForRecommendations).toHaveBeenCalledWith(
      "project_1",
      [],
    );
    expect(repository.listStepsForRecommendations).toHaveBeenCalledWith(
      "project_1",
      [],
    );
  });

  it("sanitizes all mutable prose and URLs before public caps", async () => {
    const credential = "PRIORITY_RECOMMENDATION_SECRET_4107";
    repository.listRecommendationsPage.mockResolvedValue([
      {
        ...row,
        title: `api_key=${credential}`,
        rationale:
          "Review https://example.com/pricing?token=private#internal before launch.",
        category: "owner@example.com",
      },
    ]);
    repository.listTargetsForRecommendations.mockResolvedValue([
      {
        recommendationId: row.id,
        targetType: "url",
        targetValue: "https://example.com/pricing?token=private#internal",
      },
    ]);
    repository.listStepsForRecommendations.mockResolvedValue([
      {
        recommendationId: row.id,
        position: 0,
        content: `Contact owner@example.com using api_key=${credential}`,
      },
    ]);

    const page =
      await GrowthPriorityRecommendationsReadService.listPriorityRecommendations(
        { projectId: "project_1", limit: 1 },
      );
    const item = page.recommendations[0];
    expect(item).toMatchObject({
      title: "[redacted: recognised credential material]",
      titleRedacted: true,
      category: "[email omitted]",
      categoryRedacted: true,
      displayTargets: [
        {
          type: "url",
          value: "https://example.com/pricing",
          queryOrFragmentOmitted: true,
          withheld: false,
        },
      ],
    });
    expect(item.rationale).not.toContain("token=private");
    expect(item.displaySteps[0]).toMatchObject({ redacted: true });
    expect(JSON.stringify(page)).not.toContain(credential);
    expect(JSON.stringify(page)).not.toContain("owner@example.com");
  });

  it("projects and orders children before the public five-item caps", async () => {
    repository.listTargetsForRecommendations.mockResolvedValue([
      { recommendationId: row.id, targetType: "keyword", targetValue: "zeta" },
      {
        recommendationId: row.id,
        targetType: "url",
        targetValue: "https://user:secret@example.com/a?private=1",
      },
      { recommendationId: row.id, targetType: "cluster", targetValue: "alpha" },
      { recommendationId: row.id, targetType: "site", targetValue: "beta" },
      { recommendationId: row.id, targetType: "keyword", targetValue: "gamma" },
      { recommendationId: row.id, targetType: "keyword", targetValue: "omega" },
    ]);
    repository.listStepsForRecommendations.mockResolvedValue(
      Array.from({ length: 6 }, (_, position) => ({
        recommendationId: row.id,
        position: 5 - position,
        content: `step ${5 - position}`,
      })),
    );
    const page =
      await GrowthPriorityRecommendationsReadService.listPriorityRecommendations(
        { projectId: "project_1", limit: 1 },
      );
    const item = page.recommendations[0];
    expect(item.targetCount).toBe(6);
    expect(item.displayTargetsOmitted).toBe(true);
    expect(
      item.displayTargets.find((value) => value.type === "url"),
    ).toBeUndefined();
    expect(item.displayTargetsWithheld).toBe(true);
    expect(item.displaySteps.map((value) => value.content)).toEqual([
      "step 0",
      "step 1",
      "step 2",
      "step 3",
      "step 4",
    ]);
    expect(item.displayStepsOmitted).toBe(true);
  });

  it("rejects stored child overflow before public truncation", async () => {
    repository.listStepsForRecommendations.mockResolvedValue(
      Array.from({ length: 101 }, (_, position) => ({
        recommendationId: row.id,
        position,
        content: `step ${position}`,
      })),
    );
    await expect(
      GrowthPriorityRecommendationsReadService.listPriorityRecommendations({
        projectId: "project_1",
        limit: 1,
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });

    repository.listStepsForRecommendations.mockResolvedValue([]);
    repository.listTargetsForRecommendations.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({
        recommendationId: row.id,
        targetType: "keyword",
        targetValue: `keyword-${index}`,
      })),
    );
    await expect(
      GrowthPriorityRecommendationsReadService.listPriorityRecommendations({
        projectId: "project_1",
        limit: 1,
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
