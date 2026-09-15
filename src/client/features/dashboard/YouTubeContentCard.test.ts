import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  video: {} as Record<string, unknown>,
  traffic: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === "youtubeVideoPerformance" ? state.video : state.traffic,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) =>
    createElement("a", {}, children),
}));
vi.mock("@/client/features/dashboard/cardParts", () => ({
  CardShell: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement("section", { "data-title": title }, children),
  moreDetailsClass: "more",
  PercentDelta: () => createElement("span", {}, "period change"),
}));
vi.mock("@/serverFunctions/youtube", () => ({
  getYouTubeVideoPerformance: vi.fn(),
  getYouTubeTrafficSources: vi.fn(),
}));

import { YouTubeContentCard } from "./YouTubeContentCard";

const request = {
  requestedDateRange: null,
  resolvedDateRange: { startDate: "2026-08-01", endDate: "2026-08-28" },
  previousDateRange: { startDate: "2026-07-04", endDate: "2026-07-31" },
  timeZone: "America/Los_Angeles" as const,
};
const source = {
  provider: "youtube_analytics" as const,
  channelId: "UC1",
  channelTitle: "Studio",
  channelCustomUrl: null,
};
const videoReport = {
  status: "ok" as const,
  source,
  request,
  videos: [
    {
      videoId: "video-1",
      title: "A useful video",
      publishedAt: "2026-07-01T00:00:00Z",
      thumbnailUrl: "https://i.ytimg.com/vi/video-1/mqdefault.jpg",
      url: "https://www.youtube.com/watch?v=video-1",
      current: {
        views: 120,
        estimatedMinutesWatched: 60,
        averageViewDuration: 30,
        averageViewPercentage: 50,
        likes: 10,
        comments: 2,
        shares: 3,
        subscribersGained: 4,
      },
      previous: {
        views: 100,
        estimatedMinutesWatched: 50,
        averageViewDuration: 25,
        averageViewPercentage: 45,
        likes: 8,
        comments: 1,
        shares: 2,
        subscribersGained: 2,
      },
      comparison: {},
    },
  ],
  completeness: "complete" as const,
  retrievedAt: "2026-08-29T00:00:00Z",
  warnings: [],
};
const trafficReport = {
  status: "ok" as const,
  source,
  request,
  sources: [
    {
      sourceType: "YT_SEARCH",
      current: { views: 80, estimatedMinutesWatched: 40 },
      previous: { views: 60, estimatedMinutesWatched: 30 },
      comparison: {},
      currentReportedRowsShare: 0.8,
    },
    {
      sourceType: "FUTURE_PROVIDER_CODE",
      current: { views: 20, estimatedMinutesWatched: 10 },
      previous: { views: null, estimatedMinutesWatched: null },
      comparison: {},
      currentReportedRowsShare: 0.2,
    },
  ],
  completeness: "complete" as const,
  retrievedAt: "2026-08-29T00:00:00Z",
  warnings: [],
};

function render() {
  return renderToStaticMarkup(
    createElement(YouTubeContentCard, { projectId: "project-1" }),
  );
}

describe("YouTubeContentCard", () => {
  beforeEach(() => {
    state.video = { data: videoReport, refetch: vi.fn() };
    state.traffic = { data: trafficReport, refetch: vi.fn() };
  });

  it("renders bounded video and traffic-source summaries", () => {
    const markup = render();
    expect(markup).toContain("Top videos by watch time");
    expect(markup).toContain("A useful video");
    expect(markup).toContain("120 views");
    expect(markup).toContain("YouTube search");
    expect(markup).toContain("80%");
    expect(markup).toContain("FUTURE_PROVIDER_CODE");
    expect(markup).toContain('title="FUTURE_PROVIDER_CODE"');
    expect(markup).toContain("break-all");
    expect(markup).toContain("of reported source views");
  });

  it("renders loading, partial, and empty states", () => {
    state.video = { isPending: true };
    state.traffic = {
      data: {
        ...trafficReport,
        sources: [],
        completeness: "partial",
        warnings: ["empty_current_report"],
      },
    };
    const markup = render();
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("YouTube omitted some analytics or metadata");
    expect(markup).toContain("No traffic-source data was reported");
  });

  it("renders safe typed and unexpected errors with retry", () => {
    state.video = {
      data: {
        status: "error",
        error: {
          code: "youtube_quota_exhausted",
          message: "raw provider copy",
          retryAfterSeconds: 60,
        },
      },
      refetch: vi.fn(),
    };
    state.traffic = { isError: true, refetch: vi.fn() };
    const markup = render();
    expect(markup).toContain("quota or rate limit");
    expect(markup).toContain("Couldn’t load this YouTube report");
    expect(markup.match(/Retry/g)).toHaveLength(2);
  });
});
