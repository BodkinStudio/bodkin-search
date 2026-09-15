import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { growthGetPriorityRecommendationsTool } from "./growth-priority-recommendations-tool";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  listPriorityRecommendations: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock(
  "@/server/features/growth/services/GrowthPriorityRecommendationsReadService",
  () => ({
    GrowthPriorityRecommendationsReadService: {
      listPriorityRecommendations: mocks.listPriorityRecommendations,
    },
  }),
);

const context = makeToolContext({ baseUrl: "https://open-seo.test" });
const projectId = "project_1";
const page = {
  recommendations: [],
  limit: 20,
  hasMore: false,
  nextCursor: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: projectId });
  mocks.listPriorityRecommendations.mockResolvedValue(page);
});

describe("growth_get_priority_recommendations MCP tool", () => {
  it("is a strict zero-credit saved-data read", () => {
    expect(growthGetPriorityRecommendationsTool.config.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    });
    expect(growthGetPriorityRecommendationsTool.config.description).toMatch(
      /zero credits/i,
    );
    expect(growthGetPriorityRecommendationsTool.config.description).toMatch(
      /no provider calls/i,
    );
    expect(growthGetPriorityRecommendationsTool.config.description).toMatch(
      /never creates or changes/i,
    );
    expect(
      Object.keys(growthGetPriorityRecommendationsTool.config.inputSchema),
    ).toEqual([
      "projectId",
      "statuses",
      "category",
      "minPriorityScore",
      "limit",
      "cursor",
    ]);
    expect(
      z
        .object(growthGetPriorityRecommendationsTool.config.inputSchema)
        .parse({ projectId, statuses: ["accepted", "proposed", "accepted"] }),
    ).toEqual({ projectId, statuses: ["proposed", "accepted"], limit: 20 });
  });

  it("authorizes before reading and describes current state instead of a total or discovery", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);
    const input = z
      .object(growthGetPriorityRecommendationsTool.config.inputSchema)
      .parse({ projectId });
    await expect(
      growthGetPriorityRecommendationsTool.handler(input, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listPriorityRecommendations).not.toHaveBeenCalled();
    mocks.getProjectForOrganization.mockResolvedValue({ id: projectId });
    const result = await growthGetPriorityRecommendationsTool.handler(
      input,
      context,
    );
    expect(mocks.listPriorityRecommendations).toHaveBeenCalledWith(input);
    expect(textContent(result)).toMatch(
      /not a snapshot, total, or new discovery/i,
    );
    expect(textContent(result)).not.toContain("nextCursor");
  });

  it("only gives continuation instructions for a continued current page", async () => {
    mocks.listPriorityRecommendations.mockResolvedValue({
      recommendations: [
        {
          id: "recommendation_1",
          title: "Improve the pricing page",
          titleRedacted: false,
          titleTruncated: false,
          rationale: "The page has qualified demand.",
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
          createdAt: "2026-08-20T09:00:00.000Z",
          needsAction: false,
          targetCount: 1,
          displayTargets: [
            {
              type: "url",
              value: "https://example.com/pricing",
              queryOrFragmentOmitted: false,
              withheld: false,
            },
          ],
          displayTargetsOmitted: false,
          displayTargetsWithheld: false,
          stepCount: 1,
          displaySteps: [
            {
              content: "Review the page.",
              redacted: false,
              truncated: false,
            },
          ],
          displayStepsOmitted: false,
        },
      ],
      limit: 1,
      hasMore: true,
      nextCursor: {
        priorityScore: 42,
        createdAt: "2026-08-20T09:00:00.000Z",
        id: "recommendation_1",
      },
    });

    const input = z
      .object(growthGetPriorityRecommendationsTool.config.inputSchema)
      .parse({ projectId, limit: 1 });
    const result = await growthGetPriorityRecommendationsTool.handler(
      input,
      context,
    );

    expect(textContent(result)).toContain(
      "growth_get_priority_recommendations",
    );
    expect(textContent(result)).toMatch(
      /current state, not a snapshot, total, or new discovery/i,
    );
  });
});
