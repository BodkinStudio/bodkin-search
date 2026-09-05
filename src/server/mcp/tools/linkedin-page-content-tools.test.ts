import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  topPosts: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));
vi.mock(
  "@/server/features/linkedin/services/LinkedInPageContentService",
  () => ({
    LinkedInPageContentService: {
      overview: mocks.overview,
      topPosts: mocks.topPosts,
    },
  }),
);
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

import {
  getLinkedInPageOverviewTool,
  getLinkedInPostPerformanceTool,
} from "./linkedin-page-content-tools";

const totals = {
  impressions: 100,
  membersReached: 80,
  videoViews: 20,
  clicks: 10,
  reactions: 5,
  comments: 2,
  reposts: 1,
  follows: 3,
};
const overview = {
  status: "ok" as const,
  projectId: "project-1",
  source: {
    provider: "linkedin_page_content_manual" as const,
    pageName: "OpenSEO",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    importedAt: "2026-09-01T12:00:00.000Z",
    rowCount: 1,
  },
  current: totals,
  previous: null,
  comparison: null,
  completeness: "complete" as const,
  warnings: ["no_exact_adjacent_prior_import" as const],
};

describe("LinkedIn Page Content MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project-1" });
    mocks.overview.mockResolvedValue(overview);
    mocks.topPosts.mockResolvedValue({ ...overview, posts: [] });
  });

  it("authorizes, returns exact JSON text parity, and exposes zero-credit read-only semantics", async () => {
    const result = await getLinkedInPageOverviewTool.handler(
      { projectId: "project-1" },
      makeToolContext(),
    );
    expect(mocks.getProjectForOrganization).toHaveBeenCalled();
    expect(mocks.overview).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(JSON.parse(textContent(result))).toEqual(result.structuredContent);
    expect(result.structuredContent).toMatchObject({
      ...overview,
      meta: {
        projectId: "project-1",
        url: "https://open-seo.test/p/project-1/dashboard#linkedin-page-content",
      },
    });
    expect(getLinkedInPageOverviewTool.config.description).toContain(
      "no OpenSEO credits",
    );
    expect(getLinkedInPageOverviewTool.config.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
  });

  it("normalizes the no-import action URL to an absolute project URL", async () => {
    mocks.overview.mockResolvedValue({
      status: "error",
      projectId: "project-1",
      error: {
        code: "linkedin_no_import",
        message: "Import a report.",
        actionUrl: "/p/project-1/dashboard#linkedin-page-content",
      },
    });
    const result = await getLinkedInPageOverviewTool.handler(
      { projectId: "project-1" },
      makeToolContext(),
    );
    expect(result.structuredContent).toMatchObject({
      status: "error",
      error: {
        actionUrl:
          "https://open-seo.test/p/project-1/dashboard#linkedin-page-content",
      },
    });
  });

  it("does not read when project authorization fails", async () => {
    mocks.getProjectForOrganization.mockResolvedValueOnce(null);
    await expect(
      getLinkedInPostPerformanceTool.handler(
        { projectId: "forbidden" },
        makeToolContext(),
      ),
    ).rejects.toThrow();
    expect(mocks.topPosts).not.toHaveBeenCalled();
  });

  it("requires complete outputs and bounds posts to ten", () => {
    expect(
      getLinkedInPageOverviewTool.config.outputSchema.safeParse({
        status: "ok",
      }).success,
    ).toBe(false);
    const post = {
      postUrl: null,
      postText: "Post",
      publishedAt: null,
      ...totals,
      providerClickThroughRate: null,
      providerEngagementRate: null,
    };
    expect(
      getLinkedInPostPerformanceTool.config.outputSchema.safeParse({
        ...overview,
        posts: Array.from({ length: 11 }, () => post),
        meta: {
          projectId: "project-1",
          url: "https://open-seo.test/p/project-1/dashboard",
        },
      }).success,
    ).toBe(false);
  });
});
