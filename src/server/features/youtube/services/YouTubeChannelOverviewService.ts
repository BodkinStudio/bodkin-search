import { createYouTubeClient } from "@/server/lib/youtubeClient";
import {
  YouTubeApiError,
  YouTubeMalformedResponseError,
  YouTubeReportError,
  YouTubeTokenError,
} from "@/server/lib/youtubeErrors";
import {
  YOUTUBE_ANALYTICS_TIME_ZONE,
  type YouTubeChannelOverview,
  type YouTubeOverviewMetrics,
} from "@/shared/youtube";
import { resolveYouTubeDateRange } from "./YouTubeDates";
import {
  normalizeYouTubeReport,
  YOUTUBE_OVERVIEW_METRICS,
} from "./YouTubeReportNormalization";
import { YouTubeService } from "./YouTubeService";

const METRICS = YOUTUBE_OVERVIEW_METRICS;
const WARNING_CODES = [
  "empty_current_report",
  "empty_previous_report",
  "partial_daily_trend",
] as const;
type WarningCode = (typeof WARNING_CODES)[number];

function emptyMetrics(): YouTubeOverviewMetrics {
  return {
    views: null,
    estimatedMinutesWatched: null,
    averageViewDuration: null,
    subscribersGained: null,
    subscribersLost: null,
    netSubscribers: null,
    likes: null,
    comments: null,
    shares: null,
  };
}
function metrics(row: Record<string, string | number | null> | undefined) {
  const result = emptyMetrics();
  for (const metric of METRICS) {
    const value = row?.[metric];
    result[metric] = typeof value === "number" ? value : null;
  }
  result.netSubscribers =
    result.subscribersGained != null && result.subscribersLost != null
      ? result.subscribersGained - result.subscribersLost
      : null;
  return result;
}
function comparison(
  current: YouTubeOverviewMetrics,
  previous: YouTubeOverviewMetrics,
) {
  const value = (name: keyof YouTubeOverviewMetrics) => {
    const now = current[name];
    const then = previous[name];
    const absoluteChange = now != null && then != null ? now - then : null;
    return {
      current: now,
      previous: then,
      absoluteChange,
      percentChange:
        absoluteChange != null && then != null && then !== 0
          ? absoluteChange / then
          : null,
    };
  };
  return {
    views: value("views"),
    estimatedMinutesWatched: value("estimatedMinutesWatched"),
    averageViewDuration: value("averageViewDuration"),
    subscribersGained: value("subscribersGained"),
    subscribersLost: value("subscribersLost"),
    netSubscribers: value("netSubscribers"),
    likes: value("likes"),
    comments: value("comments"),
    shares: value("shares"),
  };
}

function mapError(error: unknown): never {
  if (error instanceof YouTubeReportError) throw error;
  if (
    error instanceof YouTubeTokenError ||
    (error instanceof YouTubeApiError && error.status === 401)
  ) {
    throw new YouTubeReportError(
      "youtube_reconnect_required",
      "Reconnect YouTube to grant Analytics access.",
    );
  }
  if (error instanceof YouTubeMalformedResponseError) {
    throw new YouTubeReportError(
      "youtube_malformed_response",
      "YouTube returned an invalid Analytics report.",
    );
  }
  if (error instanceof YouTubeApiError) {
    if (error.status === 400 || error.upstreamReason === "REPORT_INCOMPATIBLE")
      throw new YouTubeReportError(
        "youtube_report_incompatible",
        "This YouTube Analytics report is not available for the selected channel.",
      );
    if (error.status === 403 && error.upstreamReason === "SERVICE_DISABLED")
      throw new YouTubeReportError(
        "youtube_analytics_not_enabled",
        "The YouTube Analytics API is not enabled for this OAuth application.",
      );
    if (
      error.status === 403 &&
      error.upstreamReason === "INSUFFICIENT_PERMISSIONS"
    )
      throw new YouTubeReportError(
        "youtube_reconnect_required",
        "Reconnect YouTube to grant Analytics access.",
      );
    if (error.status === 429 || error.upstreamReason === "QUOTA_EXCEEDED")
      throw new YouTubeReportError(
        "youtube_quota_exhausted",
        "YouTube Analytics quota is exhausted. Try again later.",
        error.retryAfterSeconds,
      );
    if (error.status === 403 || error.status === 404)
      throw new YouTubeReportError(
        "youtube_channel_inaccessible",
        "The connected Google account can no longer access this YouTube channel.",
      );
    throw new YouTubeReportError(
      "youtube_upstream_unavailable",
      "YouTube Analytics is temporarily unavailable.",
    );
  }
  throw new YouTubeReportError(
    "youtube_upstream_unavailable",
    "YouTube Analytics is temporarily unavailable.",
  );
}

async function getOverview(
  input: { projectId: string; startDate?: string; endDate?: string },
  opts: { now?: Date } = {},
): Promise<YouTubeChannelOverview> {
  const readiness = await YouTubeService.getAnalyticsConnectionStatus(
    input.projectId,
  );
  if (readiness.status === "not_connected") {
    throw new YouTubeReportError(
      "youtube_not_connected",
      "YouTube is not connected for this project.",
    );
  }
  if (readiness.status === "reconnect_required") {
    throw new YouTubeReportError(
      "youtube_reconnect_required",
      "Reconnect YouTube to grant Analytics access.",
    );
  }
  const connection = readiness.connection;
  const dateRange = resolveYouTubeDateRange(input, opts.now);
  const client = createYouTubeClient({
    userId: connection.connectedByUserId,
    youtubeAccountId: connection.youtubeAccountId,
  });
  try {
    const [currentRaw, previousRaw, trendRaw] = await Promise.all([
      client.queryAnalytics({
        channelId: connection.channelId,
        ...dateRange.resolvedDateRange,
        metrics: METRICS,
      }),
      client.queryAnalytics({
        channelId: connection.channelId,
        ...dateRange.previousDateRange,
        metrics: METRICS,
      }),
      client.queryAnalytics({
        channelId: connection.channelId,
        ...dateRange.resolvedDateRange,
        dimensions: "day",
        // Request the same metric set as the aggregate so observedThrough and
        // completeness describe the overview, not merely the views series.
        metrics: METRICS,
      }),
    ]);
    const currentReport = normalizeYouTubeReport(currentRaw, {
      metrics: METRICS,
    });
    const previousReport = normalizeYouTubeReport(previousRaw, {
      metrics: METRICS,
    });
    const trendReport = normalizeYouTubeReport(trendRaw, {
      dimensions: "day",
      metrics: METRICS,
      range: dateRange.resolvedDateRange,
    });
    const current = metrics(currentReport.rows[0]);
    const previous = metrics(previousReport.rows[0]);
    const trend = trendReport.rows.map((row) => {
      if (typeof row.day !== "string")
        throw new YouTubeMalformedResponseError();
      return {
        date: row.day,
        views: typeof row.views === "number" ? row.views : null,
      };
    });
    const warnings: WarningCode[] = [];
    if (!currentReport.rows[0]) warnings.push("empty_current_report");
    if (!previousReport.rows[0]) warnings.push("empty_previous_report");
    const expectedDays =
      (new Date(
        `${dateRange.resolvedDateRange.endDate}T00:00:00.000Z`,
      ).valueOf() -
        new Date(
          `${dateRange.resolvedDateRange.startDate}T00:00:00.000Z`,
        ).valueOf()) /
        86_400_000 +
      1;
    if (trend.length !== expectedDays || trend.some((row) => row.views == null))
      warnings.push("partial_daily_trend");
    const allKnown = [
      ...Object.values(current),
      ...Object.values(previous),
    ].every((value) => value != null);
    return {
      status: "ok",
      source: {
        provider: "youtube_analytics",
        channelId: connection.channelId,
        channelTitle: connection.channelTitle,
        channelCustomUrl: connection.channelCustomUrl,
      },
      request: { ...dateRange, timeZone: YOUTUBE_ANALYTICS_TIME_ZONE },
      current,
      previous,
      comparison: comparison(current, previous),
      trend,
      observedThrough: trendReport.observedThrough,
      completeness:
        allKnown && warnings.length === 0
          ? "complete"
          : warnings.length > 0 ||
              Object.values(current).some((value) => value != null) ||
              Object.values(previous).some((value) => value != null)
            ? "partial"
            : "unknown",
      retrievedAt: (opts.now ?? new Date()).toISOString(),
      warnings,
    };
  } catch (error) {
    mapError(error);
  }
}

export const YouTubeChannelOverviewService = { getOverview };
