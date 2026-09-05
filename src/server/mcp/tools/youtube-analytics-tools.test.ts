import { beforeEach, describe, expect, it, vi } from "vitest";
import { YouTubeReportError } from "@/server/lib/youtubeErrors";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock(
  "@/server/features/youtube/services/YouTubeChannelOverviewService",
  () => ({
    YouTubeChannelOverviewService: { getOverview: mocks.getOverview },
  }),
);
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

import { getYouTubeChannelOverviewTool } from "./youtube-analytics-tools";

describe("YouTube Analytics MCP tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
  });

  it("uses the shared channel overview DTO without reshaping it", async () => {
    const overview = {
      status: "ok" as const,
      source: {
        provider: "youtube_analytics",
        channelId: "UC1",
        channelTitle: "Studio",
        channelCustomUrl: null,
      },
      request: {
        requestedDateRange: null,
        resolvedDateRange: { startDate: "2026-08-01", endDate: "2026-08-28" },
        previousDateRange: { startDate: "2026-07-04", endDate: "2026-07-31" },
        timeZone: "America/Los_Angeles",
      },
      current: {
        views: 120,
        estimatedMinutesWatched: 60,
        averageViewDuration: 75,
        subscribersGained: 5,
        subscribersLost: 2,
        netSubscribers: 3,
        likes: 10,
        comments: 1,
        shares: 2,
      },
      previous: {
        views: 100,
        estimatedMinutesWatched: 50,
        averageViewDuration: 60,
        subscribersGained: 2,
        subscribersLost: 1,
        netSubscribers: 1,
        likes: 5,
        comments: 0,
        shares: 1,
      },
      comparison: {
        views: { absoluteChange: 20, percentChange: 0.2 },
        estimatedMinutesWatched: {
          absoluteChange: 10,
          percentChange: 0.2,
        },
        averageViewDuration: { absoluteChange: 15, percentChange: 0.25 },
        subscribersGained: { absoluteChange: 3, percentChange: 1.5 },
        subscribersLost: { absoluteChange: 1, percentChange: 1 },
        netSubscribers: { absoluteChange: 2, percentChange: 2 },
        likes: { absoluteChange: 5, percentChange: 1 },
        comments: { absoluteChange: 1, percentChange: null },
        shares: { absoluteChange: 1, percentChange: 1 },
      },
      trend: [{ date: "2026-08-01", views: 12 }],
      observedThrough: "2026-08-28",
      completeness: "partial" as const,
      retrievedAt: "2026-08-29T00:00:00.000Z",
      warnings: ["partial_daily_trend"],
    };
    mocks.getOverview.mockResolvedValue(overview);
    const result = await getYouTubeChannelOverviewTool.handler(
      { projectId: "project_1" },
      makeToolContext(),
    );
    expect(mocks.getOverview).toHaveBeenCalledWith({ projectId: "project_1" });
    expect(result.structuredContent).toEqual({
      ...overview,
      meta: { projectId: "project_1" },
    });
    const firstContent = result.content[0];
    const text = firstContent?.type === "text" ? firstContent.text : "";
    const prefix = "YouTube Analytics overview: ";
    expect(text.startsWith(prefix)).toBe(true);
    expect(JSON.parse(text.slice(prefix.length))).toEqual(
      result.structuredContent,
    );
  });

  it("returns a safe actionable reconnect response", async () => {
    mocks.getOverview.mockRejectedValue(
      new YouTubeReportError(
        "youtube_reconnect_required",
        "The YouTube connection needs to be reconnected.",
      ),
    );
    const result = await getYouTubeChannelOverviewTool.handler(
      { projectId: "project_1" },
      makeToolContext(),
    );
    expect(result.structuredContent).toMatchObject({
      status: "error",
      error: {
        code: "youtube_reconnect_required",
        actionUrl:
          "https://open-seo.test/p/project_1/settings/integrations#youtube",
      },
    });
  });

  it("requires complete success and error envelopes", () => {
    expect(
      getYouTubeChannelOverviewTool.config.outputSchema.safeParse({
        status: "ok",
      }).success,
    ).toBe(false);
    expect(
      getYouTubeChannelOverviewTool.config.outputSchema.safeParse({
        status: "error",
      }).success,
    ).toBe(false);
  });
});
