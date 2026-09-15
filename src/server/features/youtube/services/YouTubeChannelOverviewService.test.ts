import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  YouTubeApiError,
  YouTubeMalformedResponseError,
  YouTubeTokenError,
} from "@/server/lib/youtubeErrors";
import { YouTubeChannelOverviewService } from "./YouTubeChannelOverviewService";

const mocks = vi.hoisted(() => ({
  readiness: vi.fn(),
  queryAnalytics: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("@/server/lib/youtubeClient", () => ({
  createYouTubeClient: mocks.createClient,
}));
vi.mock("./YouTubeService", () => ({
  YouTubeService: { getAnalyticsConnectionStatus: mocks.readiness },
}));

const metricNames = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "subscribersGained",
  "subscribersLost",
  "likes",
  "comments",
  "shares",
] as const;
const headers = (names: string[]) =>
  names.map((name) => ({
    name,
    columnType: name === "day" ? "DIMENSION" : "METRIC",
    dataType: name === "day" ? "STRING" : "INTEGER",
  }));
const totals = (values: number[]) => ({
  columnHeaders: headers([...metricNames]),
  rows: [values],
});
const trendRow = (date: string, views: number) => [
  date,
  views,
  1,
  1,
  1,
  0,
  1,
  1,
  1,
];
const connection = {
  channelId: "UC-selected",
  channelTitle: "Selected channel",
  channelCustomUrl: "@selected",
  connectedByUserId: "connector-user",
  youtubeAccountId: "connector-account",
};

describe("YouTubeChannelOverviewService", () => {
  beforeEach(() => {
    mocks.readiness
      .mockReset()
      .mockResolvedValue({ status: "ready", connection });
    mocks.queryAnalytics
      .mockReset()
      .mockResolvedValueOnce(totals([100, 50, 20, 9, 2, 3, 4, 5]))
      .mockResolvedValueOnce(totals([80, 40, 10, 6, 1, 2, 3, 4]))
      .mockResolvedValueOnce({
        columnHeaders: headers(["day", ...metricNames]),
        rows: [trendRow("2026-03-06", 20), trendRow("2026-03-07", 80)],
      });
    mocks.createClient
      .mockReset()
      .mockReturnValue({ queryAnalytics: mocks.queryAnalytics });
  });
  it("uses only the stored connector and selected channel for exactly three reports", async () => {
    const result = await YouTubeChannelOverviewService.getOverview(
      { projectId: "p" },
      { now: new Date("2026-03-08T20:00:00Z") },
    );
    expect(mocks.createClient).toHaveBeenCalledWith({
      userId: "connector-user",
      youtubeAccountId: "connector-account",
    });
    expect(mocks.queryAnalytics).toHaveBeenCalledTimes(3);
    expect(mocks.queryAnalytics).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ channelId: "UC-selected" }),
    );
    expect(mocks.queryAnalytics).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ channelId: "UC-selected" }),
    );
    expect(mocks.queryAnalytics).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ channelId: "UC-selected" }),
    );
    expect(result.current).toMatchObject({ views: 100, netSubscribers: 7 });
    expect(result.previous).toMatchObject({ views: 80, netSubscribers: 5 });
    expect(result.comparison.views).toMatchObject({
      absoluteChange: 20,
      percentChange: 0.25,
    });
    expect(result.observedThrough).toBe("2026-03-07");
  });
  it("keeps empty and partial reports unknown rather than filling zeroes", async () => {
    mocks.queryAnalytics
      .mockReset()
      .mockResolvedValueOnce({
        columnHeaders: headers([...metricNames]),
        rows: [],
      })
      .mockResolvedValueOnce(totals([1, 1, 1, 1, 1, 1, 1, 1]))
      .mockResolvedValueOnce({
        columnHeaders: headers(["day", ...metricNames]),
        rows: [],
      });
    const result = await YouTubeChannelOverviewService.getOverview(
      { projectId: "p", startDate: "2026-02-01", endDate: "2026-02-02" },
      { now: new Date("2026-03-08T20:00:00Z") },
    );
    expect(result.current.views).toBeNull();
    expect(result.trend).toEqual([]);
    expect(result.completeness).toBe("partial");
    expect(result.warnings).toEqual(
      expect.arrayContaining(["empty_current_report", "partial_daily_trend"]),
    );
  });
  it.each([
    [{ status: "not_connected", connection: null }, "youtube_not_connected"],
    [
      { status: "reconnect_required", connection },
      "youtube_reconnect_required",
    ],
  ])("reports connection state safely", async (readiness, code) => {
    mocks.readiness.mockResolvedValue(readiness);
    await expect(
      YouTubeChannelOverviewService.getOverview({ projectId: "p" }),
    ).rejects.toMatchObject({ code });
  });
  it.each([
    [
      new YouTubeApiError(403, "forbidden", null, "SERVICE_DISABLED"),
      "youtube_analytics_not_enabled",
      null,
    ],
    [
      new YouTubeApiError(403, "forbidden", 17, "QUOTA_EXCEEDED"),
      "youtube_quota_exhausted",
      17,
    ],
    [
      new YouTubeApiError(403, "forbidden", null, "INSUFFICIENT_PERMISSIONS"),
      "youtube_reconnect_required",
      null,
    ],
    [
      new YouTubeApiError(403, "forbidden"),
      "youtube_channel_inaccessible",
      null,
    ],
    [
      new YouTubeApiError(400, "upstream", null, "REPORT_INCOMPATIBLE"),
      "youtube_report_incompatible",
      null,
    ],
    [
      new YouTubeApiError(503, "upstream"),
      "youtube_upstream_unavailable",
      null,
    ],
    [new YouTubeMalformedResponseError(), "youtube_malformed_response", null],
    [new YouTubeTokenError(), "youtube_reconnect_required", null],
  ])("maps provider failures to stable errors", async (error, code, retry) => {
    mocks.queryAnalytics.mockReset().mockRejectedValue(error);
    await expect(
      YouTubeChannelOverviewService.getOverview({ projectId: "p" }),
    ).rejects.toMatchObject({
      code,
      retryAfterSeconds: retry,
    });
  });
});
