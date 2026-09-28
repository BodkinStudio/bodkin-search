import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "@/server/lib/errors";

const mocks = vi.hoisted(() => ({
  rankedKeywords: vi.fn(),
  getProjectContext: vi.fn(),
  buildCacheKey: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ waitUntil: mocks.waitUntil }));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    domain: { rankedKeywords: mocks.rankedKeywords },
  }),
}));
vi.mock(
  "@/server/features/project-context/services/ProjectContextService",
  () => ({
    ProjectContextService: { getProjectContext: mocks.getProjectContext },
  }),
);
vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: mocks.buildCacheKey,
  getCached: mocks.getCached,
  setCached: mocks.setCached,
}));

import { CompetitorResearchService } from "./CompetitorResearchService";

const billing = {
  organizationId: "org_1",
  userId: "user_1",
  userEmail: "user@example.com",
};
const input = {
  projectId: "project_1",
  projectDomain: "project.com",
  competitorDomain: "rival.com",
  locationCode: 2840,
  languageCode: "en",
};

function ranked(keyword: string, position: number, url: string) {
  return {
    keyword_data: {
      keyword,
      keyword_info: { search_volume: 100, cpc: 1.25 },
      keyword_properties: { keyword_difficulty: 42 },
    },
    ranked_serp_element: {
      serp_item: { rank_absolute: position, url, etv: 5 },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProjectContext.mockResolvedValue({
    competitors: [{ id: "c1", domain: "rival.com" }],
  });
  mocks.buildCacheKey.mockImplementation(
    async (_prefix: string, params: Record<string, unknown>) =>
      JSON.stringify(params),
  );
  mocks.getCached.mockResolvedValue(null);
  mocks.setCached.mockResolvedValue(undefined);
  mocks.rankedKeywords
    .mockReset()
    .mockResolvedValueOnce({
      items: [
        ranked("best widgets", 10, "https://rival.com/old-widgets"),
        ranked("best widgets", 2, "https://rival.com/widgets"),
      ],
      totalCount: 65,
    })
    .mockResolvedValueOnce({
      items: [
        ranked("best widgets", 11, "https://project.com/old-widgets"),
        ranked("best widgets", 7, "https://project.com/widgets"),
      ],
      totalCount: 2,
    });
});

describe("CompetitorResearchService", () => {
  it.each([
    { locationCode: 999999, languageCode: "en" },
    { locationCode: 2840, languageCode: "xx" },
    { locationCode: 2840, languageCode: "de" },
  ])(
    "rejects an unsupported market before cache or provider work: %o",
    async (market) => {
      await expect(
        CompetitorResearchService.compare({ ...input, ...market }, billing),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mocks.rankedKeywords).not.toHaveBeenCalled();
      expect(mocks.getCached).not.toHaveBeenCalled();
    },
  );

  it("only accepts a saved competitor for the current project", async () => {
    mocks.getProjectContext.mockResolvedValue({ competitors: [] });

    await expect(
      CompetitorResearchService.compare(input, billing),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<AppError>);
    expect(mocks.rankedKeywords).not.toHaveBeenCalled();
  });

  it("rejects the project domain and a missing project target before provider work", async () => {
    await expect(
      CompetitorResearchService.compare(
        { ...input, competitorDomain: "www.project.com" },
        billing,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<AppError>);
    await expect(
      CompetitorResearchService.compare(
        { ...input, projectDomain: null },
        billing,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<AppError>);
    expect(mocks.getProjectContext).not.toHaveBeenCalled();
    expect(mocks.rankedKeywords).not.toHaveBeenCalled();
  });

  it("compares the competitor top-traffic sample against an exact project keyword lookup", async () => {
    const result = await CompetitorResearchService.compare(input, billing);

    expect(mocks.rankedKeywords).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        target: "rival.com",
        limit: 50,
        orderBy: ["ranked_serp_element.serp_item.etv,desc"],
      }),
    );
    expect(mocks.rankedKeywords).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        target: "project.com",
        limit: 50,
        filters: [["keyword_data.keyword", "in", ["best widgets"]]],
      }),
    );
    expect(result).toMatchObject({
      rows: [
        {
          keyword: "best widgets",
          competitorPosition: 2,
          projectPosition: 7,
          competitorUrl: "https://rival.com/widgets",
          projectUrl: "https://project.com/widgets",
          searchVolume: 100,
          cpc: 1.25,
          keywordDifficulty: 42,
        },
      ],
      billing: {
        providerCallsMaximum: 2,
        estimateUsd: null,
        estimateKnown: false,
      },
      topic: null,
    });
    expect(result.warnings).toContain(
      "More competitor keywords exist outside this sample.",
    );
  });

  it("keeps unmatched project positions unknown when the exact lookup is truncated", async () => {
    mocks.rankedKeywords
      .mockReset()
      .mockResolvedValueOnce({
        items: [
          ranked("best widgets", 2, "https://rival.com/widgets"),
          ranked("cheap widgets", 3, "https://rival.com/cheap"),
        ],
        totalCount: 2,
      })
      .mockResolvedValueOnce({
        items: [ranked("best widgets", 7, "https://project.com/widgets")],
        totalCount: null,
      });

    const result = await CompetitorResearchService.compare(input, billing);

    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "cheap widgets",
          projectPosition: null,
          projectUrl: null,
        }),
      ]),
    );
    expect(result.warnings).toContain(
      "Some project rankings are unknown because the exact-keyword lookup was truncated or did not report a total.",
    );
  });

  it("filters the competitor sample by an escaped topic and reports the scope", async () => {
    const result = await CompetitorResearchService.compare(
      { ...input, topic: "widgets_50%" },
      billing,
    );

    expect(mocks.rankedKeywords).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        filters: [["keyword_data.keyword", "ilike", "%widgets\\_50\\%%"]],
      }),
    );
    expect(mocks.rankedKeywords).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        filters: [["keyword_data.keyword", "in", ["best widgets"]]],
      }),
    );
    expect(result.topic).toBe("widgets_50%");
    expect(result.warnings[0]).toBe(
      "Competitor keywords match “widgets_50%” and are capped at 50 top-traffic rows.",
    );
  });

  it("surfaces provider failures and isolates cache entries by project and market", async () => {
    mocks.rankedKeywords
      .mockReset()
      .mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(
      CompetitorResearchService.compare(input, billing),
    ).rejects.toThrow("provider unavailable");

    mocks.rankedKeywords.mockReset();
    mocks.rankedKeywords.mockResolvedValueOnce({ items: [], totalCount: 0 });
    await CompetitorResearchService.compare(
      { ...input, projectId: "project_2", locationCode: 2036 },
      billing,
    );
    expect(mocks.buildCacheKey).toHaveBeenLastCalledWith(
      "competitor:keyword-research",
      expect.objectContaining({
        projectId: "project_2",
        locationCode: 2036,
        organizationId: "org_1",
      }),
    );
  });
});
