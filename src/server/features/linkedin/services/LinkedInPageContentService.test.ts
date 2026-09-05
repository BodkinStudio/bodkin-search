import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LinkedInImportRecord,
  LinkedInPageContentRepositoryContract,
  LinkedInPostMetricRecord,
} from "../repositories/LinkedInPageContentRepository";
import { createLinkedInPageContentService } from "./LinkedInPageContentService";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const repo = {
  replaceImport:
    vi.fn<LinkedInPageContentRepositoryContract["replaceImport"]>(),
  findLatestImport:
    vi.fn<LinkedInPageContentRepositoryContract["findLatestImport"]>(),
  findImportByPeriod:
    vi.fn<LinkedInPageContentRepositoryContract["findImportByPeriod"]>(),
  listPosts: vi.fn<LinkedInPageContentRepositoryContract["listPosts"]>(),
  listTopPosts: vi.fn<LinkedInPageContentRepositoryContract["listTopPosts"]>(),
} satisfies LinkedInPageContentRepositoryContract;

const currentImport: LinkedInImportRecord = {
  id: "current",
  projectId: "project-1",
  pageName: "OpenSEO",
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  importedAt: "2026-09-01T12:00:00.000Z",
  rowCount: 2,
};
const priorImport: LinkedInImportRecord = {
  ...currentImport,
  id: "prior",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  importedAt: "2026-08-01T12:00:00.000Z",
};

function metricRow(
  overrides: Partial<LinkedInPostMetricRecord> = {},
): LinkedInPostMetricRecord {
  return {
    id: "post-1",
    importId: "current",
    postKey: "a".repeat(64),
    postUrl: "https://www.linkedin.com/posts/example",
    postText: "Example post",
    publishedAt: "2026-08-15",
    impressions: 100,
    membersReached: 80,
    clicks: 10,
    reactions: 5,
    comments: 2,
    reposts: 1,
    videoViews: 20,
    follows: 3,
    providerClickThroughRate: 1_025,
    providerEngagementRate: 550,
    ...overrides,
  };
}

const importCommand = {
  projectId: "project-1",
  pageName: "OpenSEO",
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  posts: [
    {
      postUrl: "https://www.linkedin.com/posts/example",
      postText: "Example post",
      publishedAt: "2026-08-15",
      impressions: 100,
      membersReached: 80,
      clicks: 10,
      reactions: 5,
      comments: 2,
      reposts: 1,
      videoViews: 20,
      follows: 3,
      providerClickThroughRate: 10.25,
      providerEngagementRate: 5.5,
    },
  ],
};

describe("LinkedInPageContentService", () => {
  const service = createLinkedInPageContentService(repo);

  beforeEach(() => {
    vi.clearAllMocks();
    repo.replaceImport.mockResolvedValue(undefined);
    repo.findImportByPeriod.mockResolvedValue(null);
    repo.findLatestImport.mockResolvedValue(currentImport);
    repo.listPosts.mockResolvedValue([metricRow()]);
    repo.listTopPosts.mockResolvedValue([metricRow()]);
  });

  it("validates imports, hashes identities, and reports period replacement", async () => {
    repo.findImportByPeriod.mockResolvedValueOnce(priorImport);
    const result = await service.import(importCommand);
    expect(result).toMatchObject({ status: "ok", rowCount: 1, replaced: true });
    const stored = repo.replaceImport.mock.calls[0]?.[0];
    expect(stored).toMatchObject({
      projectId: "project-1",
      pageName: "OpenSEO",
    });
    expect(stored?.posts[0]?.postKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns a safe typed error when persistence fails", async () => {
    repo.replaceImport.mockRejectedValueOnce(new Error("provider detail"));
    await expect(service.import(importCommand)).resolves.toEqual({
      status: "error",
      error: {
        code: "linkedin_import_failed",
        message:
          "The LinkedIn Page Content import could not be saved. Try again.",
      },
    });
  });

  it("aggregates nullable metrics and compares only the exact adjacent period", async () => {
    repo.findImportByPeriod.mockResolvedValueOnce(priorImport);
    repo.listPosts
      .mockResolvedValueOnce([
        metricRow(),
        metricRow({
          id: "post-2",
          postKey: "b".repeat(64),
          impressions: 50,
          clicks: null,
        }),
      ])
      .mockResolvedValueOnce([
        metricRow({ importId: "prior", impressions: 120, clicks: 7 }),
      ]);
    const result = await service.overview({ projectId: "project-1" });
    expect(repo.findImportByPeriod).toHaveBeenCalledWith(
      "project-1",
      "2026-07-01",
      "2026-07-31",
    );
    expect(result).toMatchObject({
      status: "ok",
      current: { impressions: 150, clicks: 10 },
      previous: { impressions: 120, clicks: 7 },
      comparison: { impressions: 30, clicks: 3 },
      completeness: "partial",
      warnings: ["partial_current_metric_values"],
    });
  });

  it("does not compare another Page imported for the prior dates", async () => {
    repo.findImportByPeriod.mockResolvedValueOnce({
      ...priorImport,
      pageName: "Another Page",
    });
    const result = await service.overview({ projectId: "project-1" });
    expect(result).toMatchObject({
      status: "ok",
      previous: null,
      comparison: null,
      warnings: ["no_exact_adjacent_prior_import"],
    });
    expect(repo.listPosts).toHaveBeenCalledTimes(1);
  });

  it("marks missing provider rates in current and prior imports as partial", async () => {
    repo.findImportByPeriod.mockResolvedValueOnce(priorImport);
    repo.listPosts
      .mockResolvedValueOnce([metricRow({ providerClickThroughRate: null })])
      .mockResolvedValueOnce([
        metricRow({
          importId: "prior",
          providerEngagementRate: null,
        }),
      ]);
    await expect(
      service.overview({ projectId: "project-1" }),
    ).resolves.toMatchObject({
      completeness: "partial",
      warnings: [
        "partial_current_metric_values",
        "partial_previous_metric_values",
      ],
    });
  });

  it("bounds top posts and converts stored basis points back to provider rates", async () => {
    const result = await service.topPosts({ projectId: "project-1" });
    expect(repo.listTopPosts).toHaveBeenCalledWith("current", 10);
    expect(result).toMatchObject({
      status: "ok",
      posts: [{ providerClickThroughRate: 10.25, providerEngagementRate: 5.5 }],
    });
  });

  it("returns an actionable typed result when no import exists", async () => {
    repo.findLatestImport.mockResolvedValueOnce(null);
    await expect(
      service.overview({ projectId: "project-1" }),
    ).resolves.toMatchObject({
      status: "error",
      projectId: "project-1",
      error: {
        code: "linkedin_no_import",
        actionUrl: "/p/project-1/dashboard#linkedin-page-content",
      },
    });
  });
});
