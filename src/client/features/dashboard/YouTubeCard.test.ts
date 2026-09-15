import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ query: {} as Record<string, unknown> }));

vi.mock("@tanstack/react-query", () => ({ useQuery: () => state.query }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) =>
    createElement("a", {}, children),
}));
vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
  ResponsiveContainer: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
vi.mock("@/client/features/dashboard/cardParts", () => ({
  CardShell: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement("section", { "data-title": title }, children),
  moreDetailsClass: "more",
  PercentDelta: () => createElement("span", {}, "change"),
  Stat: ({ label, value }: { label: string; value: string }) =>
    createElement("p", {}, `${label}: ${value}`),
}));
vi.mock("@/serverFunctions/youtube", () => ({
  getYouTubeChannelOverview: vi.fn(),
}));

import { YouTubeCard } from "./YouTubeCard";

const overview = {
  status: "ok" as const,
  source: {
    provider: "youtube_analytics" as const,
    channelId: "UC1",
    channelTitle: "Studio",
    channelCustomUrl: null,
  },
  request: {
    requestedDateRange: null,
    resolvedDateRange: { startDate: "2026-08-01", endDate: "2026-08-28" },
    previousDateRange: { startDate: "2026-07-04", endDate: "2026-07-31" },
    timeZone: "America/Los_Angeles" as const,
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
  comparison: {},
  trend: [{ date: "2026-08-01", views: 12 }],
  observedThrough: "2026-08-28",
  completeness: "complete" as const,
  retrievedAt: "2026-08-29T00:00:00.000Z",
  warnings: [],
};

function render(query: Record<string, unknown>) {
  state.query = query;
  return renderToStaticMarkup(
    createElement(YouTubeCard, { projectId: "project-1" }),
  );
}

describe("YouTubeCard", () => {
  beforeEach(() => {
    state.query = {};
  });

  it("renders loading and populated metrics with a trend", () => {
    expect(render({ isPending: true })).toContain('aria-busy="true"');
    const markup = render({ data: overview });
    expect(markup).toContain("Views: 120");
    expect(markup).toContain("Watch time: 60 min");
    expect(markup).toContain("Avg. view duration: 1m 15s");
    expect(markup).toContain("Net subscribers: 3");
    expect(markup).toContain("Daily views data");
    expect(markup).toContain("2026-08-01: 12 views");
  });

  it("shows explicit no-data and partial-data status", () => {
    expect(
      render({
        data: {
          ...overview,
          trend: [],
          current: { ...overview.current, views: null },
        },
      }),
    ).toContain("No YouTube view data");
    expect(
      render({
        data: {
          ...overview,
          completeness: "partial",
          warnings: ["recent_rows_missing"],
        },
      }),
    ).toContain("Recent YouTube Analytics data may be incomplete");
  });

  it.each([
    ["youtube_reconnect_required", "Reconnect with Google", false],
    ["youtube_channel_inaccessible", "can no longer access", false],
    ["youtube_quota_exhausted", "quota or rate limit", true],
    ["youtube_upstream_unavailable", "temporarily unavailable", true],
  ])("renders accessible %s feedback", (code, copy, retryable) => {
    const markup = render({
      data: {
        status: "error",
        error: { code, message: "raw provider error", retryAfterSeconds: null },
      },
      refetch: vi.fn(),
    });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(copy);
    expect(markup.includes("Retry")).toBe(retryable);
  });

  it("offers retry after an unexpected query failure", () => {
    const markup = render({ isError: true, refetch: vi.fn() });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Retry");
  });
});
