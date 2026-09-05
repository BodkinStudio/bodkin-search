import { beforeEach, describe, expect, it, vi } from "vitest";
import { YouTubeContentAnalyticsService } from "./YouTubeContentAnalyticsService";

const mocks = vi.hoisted(() => ({
  readiness: vi.fn(),
  queryAnalytics: vi.fn(),
  listVideos: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@/server/lib/youtubeClient", () => ({
  createYouTubeClient: mocks.createClient,
}));
vi.mock("./YouTubeService", () => ({
  YouTubeService: { getAnalyticsConnectionStatus: mocks.readiness },
}));

const connection = {
  channelId: "UC-selected",
  channelTitle: "Selected",
  channelCustomUrl: null,
  connectedByUserId: "connector",
  youtubeAccountId: "account",
};
const videoMetrics = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "likes",
  "comments",
  "shares",
  "subscribersGained",
];
const headers = (dimension: string, metrics: string[]) => [
  { name: dimension, columnType: "DIMENSION", dataType: "STRING" },
  ...metrics.map((name) => ({
    name,
    columnType: "METRIC",
    dataType: "INTEGER",
  })),
];
const videoReport = (rows: unknown[][]) => ({
  columnHeaders: headers("video", videoMetrics),
  rows,
});
const trafficReport = (rows: unknown[][]) => ({
  columnHeaders: headers("insightTrafficSourceType", [
    "views",
    "estimatedMinutesWatched",
  ]),
  rows,
});

describe("YouTubeContentAnalyticsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readiness.mockResolvedValue({ status: "ready", connection });
    mocks.createClient.mockReturnValue({
      queryAnalytics: mocks.queryAnalytics,
      listVideos: mocks.listVideos,
    });
    mocks.listVideos.mockResolvedValue([]);
  });
  it("uses connector provenance, bounds top videos, and preserves metadata and previous gaps", async () => {
    mocks.queryAnalytics
      .mockResolvedValueOnce(
        videoReport([
          ["one", 100, 50, 20, 40, 3, 1, 2, 4],
          ["two", 20, 10, 5, 20, 1, 0, 0, 1],
        ]),
      )
      .mockResolvedValueOnce(
        videoReport([["one", 80, 40, 15, 30, 2, 1, 1, 3]]),
      );
    mocks.listVideos.mockResolvedValue([
      {
        videoId: "one",
        title: "One",
        publishedAt: "2026-01-01T00:00:00Z",
        thumbnailUrl: null,
      },
    ]);
    const result = await YouTubeContentAnalyticsService.getVideoPerformance(
      { projectId: "p" },
      { now: new Date("2026-03-08T20:00:00Z") },
    );
    expect(mocks.createClient).toHaveBeenCalledWith({
      userId: "connector",
      youtubeAccountId: "account",
    });
    expect(mocks.queryAnalytics).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        channelId: "UC-selected",
        dimensions: "video",
        sort: "-estimatedMinutesWatched",
        maxResults: 10,
      }),
    );
    expect(mocks.queryAnalytics).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ filters: "video==one,two", maxResults: 10 }),
    );
    expect(mocks.listVideos).toHaveBeenCalledWith(["one", "two"]);
    expect(result.videos[1]).toMatchObject({
      videoId: "two",
      title: null,
      previous: { views: null },
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "partial_previous_report",
        "partial_video_metadata",
      ]),
    );
  });
  it("keeps traffic source unions, unknown codes, and reported-row shares without zero filling", async () => {
    mocks.queryAnalytics
      .mockResolvedValueOnce(
        trafficReport([
          ["YT_SEARCH", 30, 10],
          ["NEW_UNKNOWN", 10, 2],
        ]),
      )
      .mockResolvedValueOnce(
        trafficReport([
          ["YT_SEARCH", 20, 8],
          ["EXTERNAL", 5, 1],
        ]),
      );
    const result = await YouTubeContentAnalyticsService.getTrafficSources(
      { projectId: "p" },
      { now: new Date("2026-03-08T20:00:00Z") },
    );
    expect(result.sources.map((source) => source.sourceType)).toEqual([
      "YT_SEARCH",
      "NEW_UNKNOWN",
      "EXTERNAL",
    ]);
    expect(result.sources[1]).toMatchObject({
      currentReportedRowsShare: 0.25,
      previous: { views: null },
    });
    expect(result.sources[2]).toMatchObject({
      current: { views: null },
      previous: { views: 5 },
    });
    expect(result.warnings).toContain("partial_source_comparison");
  });
  it("returns empty video reports without unnecessary prior query or metadata request", async () => {
    mocks.queryAnalytics.mockResolvedValueOnce(videoReport([]));
    const result = await YouTubeContentAnalyticsService.getVideoPerformance({
      projectId: "p",
    });
    expect(result).toMatchObject({
      videos: [],
      completeness: "unknown",
      warnings: ["empty_current_report"],
    });
    expect(mocks.queryAnalytics).toHaveBeenCalledTimes(1);
    expect(mocks.listVideos).toHaveBeenCalledWith([]);
  });
  it("marks returned null video metric cells as partial", async () => {
    mocks.queryAnalytics
      .mockResolvedValueOnce(
        videoReport([["one", 100, 50, 20, 40, null, 1, 2, 4]]),
      )
      .mockResolvedValueOnce(
        videoReport([["one", 80, 40, 15, 30, 2, 1, 1, 3]]),
      );
    mocks.listVideos.mockResolvedValue([
      {
        videoId: "one",
        title: "One",
        publishedAt: "2026-01-01T00:00:00Z",
        thumbnailUrl: null,
      },
    ]);
    const result = await YouTubeContentAnalyticsService.getVideoPerformance({
      projectId: "p",
    });
    expect(result.videos[0]?.current.likes).toBeNull();
    expect(result.warnings).toContain("partial_current_metrics");
    expect(result.completeness).toBe("partial");
  });
  it("marks null traffic views partial and excludes them from numeric shares", async () => {
    mocks.queryAnalytics
      .mockResolvedValueOnce(
        trafficReport([
          ["YT_SEARCH", 30, 10],
          ["NEW_UNKNOWN", null, 2],
        ]),
      )
      .mockResolvedValueOnce(
        trafficReport([
          ["YT_SEARCH", 20, 8],
          ["NEW_UNKNOWN", 5, 1],
        ]),
      );
    const result = await YouTubeContentAnalyticsService.getTrafficSources({
      projectId: "p",
    });
    expect(result.sources[0]?.currentReportedRowsShare).toBe(1);
    expect(result.sources[1]).toMatchObject({
      sourceType: "NEW_UNKNOWN",
      currentReportedRowsShare: null,
    });
    expect(result.warnings).toContain("partial_current_metrics");
    expect(result.completeness).toBe("partial");
  });
});
