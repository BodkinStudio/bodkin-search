import type { LinkedInPageMetricTotals } from "@/shared/linkedin";
import { AppError } from "@/server/lib/errors";

const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function linkedInDateRange(startDate?: string, endDate?: string) {
  const end = endDate ?? new Date().toISOString().slice(0, 10);
  const start =
    startDate ?? new Date(Date.now() - 27 * DAY).toISOString().slice(0, 10);
  const startMs = Date.parse(`${start}T00:00:00.000Z`),
    endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (
    !DATE.test(start) ||
    !DATE.test(end) ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs > endMs ||
    endMs - startMs > 365 * DAY
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Use an inclusive UTC ISO date range no longer than 366 days.",
    );
  return { start, end };
}
export function linkedInPreviousRange(range: { start: string; end: string }) {
  const length =
    (Date.parse(`${range.end}T00:00:00Z`) -
      Date.parse(`${range.start}T00:00:00Z`)) /
      DAY +
    1;
  const end = Date.parse(`${range.start}T00:00:00Z`) - DAY;
  return {
    start: new Date(end - (length - 1) * DAY).toISOString().slice(0, 10),
    end: new Date(end).toISOString().slice(0, 10),
  };
}
/** Follower/share are [start, next-day-end); page is (day-before-start, end]. */
export function linkedInIntervals(range: { start: string; end: string }) {
  const start = Date.parse(`${range.start}T00:00:00.000Z`),
    end = Date.parse(`${range.end}T00:00:00.000Z`);
  return {
    followerAndShare: `(timeRange:(start:${start},end:${end + DAY}),timeGranularityType:DAY)`,
    page: `(timeRange:(start:${start - DAY},end:${end}),timeGranularityType:DAY)`,
  };
}

export type LinkedInPageMetrics = {
  followerGains: number | null;
  pageViews: number | null;
  organicImpressions: number | null;
  uniqueImpressions: number | null;
  clicks: number | null;
  likes: number | null;
  comments: number | null;
  reposts: number | null;
};

export function asOverview(
  metrics: LinkedInPageMetrics,
): LinkedInPageMetricTotals {
  return {
    impressions: metrics.organicImpressions,
    membersReached: metrics.uniqueImpressions,
    videoViews: null,
    clicks: metrics.clicks,
    reactions: metrics.likes,
    comments: metrics.comments,
    reposts: metrics.reposts,
    follows: metrics.followerGains,
    pageViews: metrics.pageViews,
  };
}
