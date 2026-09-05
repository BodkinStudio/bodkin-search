import { createYouTubeClient } from "@/server/lib/youtubeClient";
import {
  YouTubeMalformedResponseError,
  YouTubeReportError,
} from "@/server/lib/youtubeErrors";
import {
  YOUTUBE_ANALYTICS_TIME_ZONE,
  type YouTubeMetricsComparison,
  type YouTubeTrafficSourceMetrics,
  type YouTubeTrafficSources,
  type YouTubeVideoMetrics,
  type YouTubeVideoPerformance,
} from "@/shared/youtube";
import { mapYouTubeReportError } from "./YouTubeChannelOverviewService";
import { resolveYouTubeDateRange } from "./YouTubeDates";
import {
  normalizeYouTubeReport,
  YOUTUBE_TRAFFIC_SOURCE_METRICS,
  YOUTUBE_VIDEO_METRICS,
} from "./YouTubeReportNormalization";
import { YouTubeService } from "./YouTubeService";

const VIDEO_METRICS = YOUTUBE_VIDEO_METRICS;
const TRAFFIC_METRICS = YOUTUBE_TRAFFIC_SOURCE_METRICS;
type Row = Record<string, string | number | null>;

function metricValues(
  names: readonly string[],
  row?: Row,
): Record<string, number | null> {
  return Object.fromEntries(
    names.map((name) => [
      name,
      typeof row?.[name] === "number" ? row[name] : null,
    ]),
  );
}

function videoMetrics(row?: Row): YouTubeVideoMetrics {
  const values = metricValues(VIDEO_METRICS, row);
  return {
    views: values.views ?? null,
    estimatedMinutesWatched: values.estimatedMinutesWatched ?? null,
    averageViewDuration: values.averageViewDuration ?? null,
    averageViewPercentage: values.averageViewPercentage ?? null,
    likes: values.likes ?? null,
    comments: values.comments ?? null,
    shares: values.shares ?? null,
    subscribersGained: values.subscribersGained ?? null,
  };
}
function trafficMetrics(row?: Row): YouTubeTrafficSourceMetrics {
  const values = metricValues(TRAFFIC_METRICS, row);
  return {
    views: values.views ?? null,
    estimatedMinutesWatched: values.estimatedMinutesWatched ?? null,
  };
}

function comparison(
  current: Record<string, number | null>,
  previous: Record<string, number | null>,
): YouTubeMetricsComparison {
  return Object.fromEntries(
    Object.keys(current).map((key) => {
      const now = current[key];
      const then = previous[key];
      const absoluteChange = now != null && then != null ? now - then : null;
      return [
        key,
        {
          current: now,
          previous: then,
          absoluteChange,
          percentChange:
            absoluteChange != null && then != null && then !== 0
              ? absoluteChange / then
              : null,
        },
      ];
    }),
  );
}

async function ready(input: { projectId: string }) {
  const readiness = await YouTubeService.getAnalyticsConnectionStatus(
    input.projectId,
  );
  if (readiness.status === "not_connected")
    throw new YouTubeReportError(
      "youtube_not_connected",
      "YouTube is not connected for this project.",
    );
  if (readiness.status === "reconnect_required")
    throw new YouTubeReportError(
      "youtube_reconnect_required",
      "Reconnect YouTube to grant Analytics access.",
    );
  return readiness.connection;
}

function envelope(
  connection: Awaited<ReturnType<typeof ready>>,
  dateRange: ReturnType<typeof resolveYouTubeDateRange>,
) {
  return {
    source: {
      provider: "youtube_analytics" as const,
      channelId: connection.channelId,
      channelTitle: connection.channelTitle,
      channelCustomUrl: connection.channelCustomUrl,
    },
    request: { ...dateRange, timeZone: YOUTUBE_ANALYTICS_TIME_ZONE },
  };
}

async function getVideoPerformance(
  input: { projectId: string; startDate?: string; endDate?: string },
  opts: { now?: Date } = {},
): Promise<YouTubeVideoPerformance> {
  const connection = await ready(input);
  const dateRange = resolveYouTubeDateRange(input, opts.now);
  const client = createYouTubeClient({
    userId: connection.connectedByUserId,
    youtubeAccountId: connection.youtubeAccountId,
  });
  try {
    const currentRaw = await client.queryAnalytics({
      channelId: connection.channelId,
      ...dateRange.resolvedDateRange,
      dimensions: "video",
      metrics: VIDEO_METRICS,
      sort: "-estimatedMinutesWatched",
      maxResults: 10,
    });
    const current = normalizeYouTubeReport(currentRaw, {
      dimensions: "video",
      metrics: VIDEO_METRICS,
    });
    const videoIds = current.rows
      .map((row) => row.video)
      .filter((id): id is string => typeof id === "string");
    if (videoIds.length > 10 || new Set(videoIds).size !== videoIds.length)
      throw new YouTubeMalformedResponseError();
    const [previousRaw, metadata] = await Promise.all([
      videoIds.length === 0
        ? Promise.resolve(null)
        : client.queryAnalytics({
            channelId: connection.channelId,
            ...dateRange.previousDateRange,
            dimensions: "video",
            metrics: VIDEO_METRICS,
            filters: `video==${videoIds.join(",")}`,
            maxResults: 10,
          }),
      client.listVideos(videoIds),
    ]);
    const previous = previousRaw
      ? normalizeYouTubeReport(previousRaw, {
          dimensions: "video",
          metrics: VIDEO_METRICS,
        })
      : { rows: [], observedThrough: null };
    const previousById = new Map(previous.rows.map((row) => [row.video, row]));
    const metadataById = new Map(metadata.map((item) => [item.videoId, item]));
    if (
      previous.rows.length > videoIds.length ||
      [...previousById.keys()].some(
        (videoId) => typeof videoId !== "string" || !videoIds.includes(videoId),
      ) ||
      [...metadataById.keys()].some((videoId) => !videoIds.includes(videoId))
    )
      throw new YouTubeMalformedResponseError();
    const warnings: string[] = [];
    if (current.rows.length === 0) warnings.push("empty_current_report");
    if (previous.rows.length < current.rows.length)
      warnings.push("partial_previous_report");
    if (metadata.length < videoIds.length)
      warnings.push("partial_video_metadata");
    const videos = current.rows.map((row) => {
      const videoId = row.video;
      if (typeof videoId !== "string")
        throw new YouTubeMalformedResponseError();
      const currentMetrics = videoMetrics(row);
      const previousMetrics = videoMetrics(previousById.get(videoId));
      const item = metadataById.get(videoId);
      return {
        videoId,
        title: item?.title ?? null,
        publishedAt: item?.publishedAt ?? null,
        thumbnailUrl: item?.thumbnailUrl ?? null,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        current: currentMetrics,
        previous: previousMetrics,
        comparison: comparison(currentMetrics, previousMetrics),
      };
    });
    if (videos.some((video) => Object.values(video.current).includes(null)))
      warnings.push("partial_current_metrics");
    if (videos.some((video) => Object.values(video.previous).includes(null)))
      warnings.push("partial_previous_metrics");
    return {
      status: "ok",
      ...envelope(connection, dateRange),
      videos,
      observedThrough: null,
      completeness:
        warnings.length === 0
          ? "complete"
          : videos.length > 0
            ? "partial"
            : "unknown",
      retrievedAt: (opts.now ?? new Date()).toISOString(),
      warnings,
    };
  } catch (error) {
    mapYouTubeReportError(error);
  }
}

async function getTrafficSources(
  input: { projectId: string; startDate?: string; endDate?: string },
  opts: { now?: Date } = {},
): Promise<YouTubeTrafficSources> {
  const connection = await ready(input);
  const dateRange = resolveYouTubeDateRange(input, opts.now);
  const client = createYouTubeClient({
    userId: connection.connectedByUserId,
    youtubeAccountId: connection.youtubeAccountId,
  });
  try {
    const [currentRaw, previousRaw] = await Promise.all([
      client.queryAnalytics({
        channelId: connection.channelId,
        ...dateRange.resolvedDateRange,
        dimensions: "insightTrafficSourceType",
        metrics: TRAFFIC_METRICS,
        maxResults: 25,
      }),
      client.queryAnalytics({
        channelId: connection.channelId,
        ...dateRange.previousDateRange,
        dimensions: "insightTrafficSourceType",
        metrics: TRAFFIC_METRICS,
        maxResults: 25,
      }),
    ]);
    const current = normalizeYouTubeReport(currentRaw, {
      dimensions: "insightTrafficSourceType",
      metrics: TRAFFIC_METRICS,
    });
    const previous = normalizeYouTubeReport(previousRaw, {
      dimensions: "insightTrafficSourceType",
      metrics: TRAFFIC_METRICS,
    });
    if (current.rows.length > 25 || previous.rows.length > 25)
      throw new YouTubeMalformedResponseError();
    const currentByType = new Map(
      current.rows.map((row) => [row.insightTrafficSourceType, row]),
    );
    const previousByType = new Map(
      previous.rows.map((row) => [row.insightTrafficSourceType, row]),
    );
    const currentTypes = [...currentByType.keys()]
      .filter((value): value is string => typeof value === "string")
      .toSorted(
        (a, b) =>
          (Number(currentByType.get(b)?.views) || 0) -
          (Number(currentByType.get(a)?.views) || 0),
      );
    const previousOnlyTypes = [...previousByType.keys()]
      .filter(
        (value): value is string =>
          typeof value === "string" && !currentByType.has(value),
      )
      .toSorted((a, b) => a.localeCompare(b));
    const unboundedTypes = [...currentTypes, ...previousOnlyTypes];
    const types = unboundedTypes.slice(0, 25);
    const reportedViews = current.rows.reduce(
      (sum, row) => sum + (typeof row.views === "number" ? row.views : 0),
      0,
    );
    const sources = types
      .map((sourceType) => {
        const currentMetrics = trafficMetrics(currentByType.get(sourceType));
        const previousMetrics = trafficMetrics(previousByType.get(sourceType));
        return {
          sourceType,
          current: currentMetrics,
          previous: previousMetrics,
          comparison: comparison(currentMetrics, previousMetrics),
          currentReportedRowsShare:
            currentMetrics.views != null && reportedViews > 0
              ? currentMetrics.views / reportedViews
              : null,
        };
      })
      .toSorted((a, b) => (b.current.views ?? -1) - (a.current.views ?? -1));
    const warnings: string[] = [];
    if (current.rows.length === 0) warnings.push("empty_current_report");
    if (previous.rows.length === 0) warnings.push("empty_previous_report");
    if (
      types.some(
        (type) => !currentByType.has(type) || !previousByType.has(type),
      )
    )
      warnings.push("partial_source_comparison");
    if (
      current.rows.some((row) =>
        TRAFFIC_METRICS.some((metric) => row[metric] === null),
      )
    )
      warnings.push("partial_current_metrics");
    if (
      previous.rows.some((row) =>
        TRAFFIC_METRICS.some((metric) => row[metric] === null),
      )
    )
      warnings.push("partial_previous_metrics");
    if (unboundedTypes.length > types.length)
      warnings.push("truncated_previous_only_sources");
    return {
      status: "ok",
      ...envelope(connection, dateRange),
      sources,
      observedThrough: null,
      completeness:
        warnings.length === 0
          ? "complete"
          : sources.length > 0
            ? "partial"
            : "unknown",
      retrievedAt: (opts.now ?? new Date()).toISOString(),
      warnings,
    };
  } catch (error) {
    mapYouTubeReportError(error);
  }
}

export const YouTubeContentAnalyticsService = {
  getVideoPerformance,
  getTrafficSources,
};
