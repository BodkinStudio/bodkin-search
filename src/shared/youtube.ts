/** Dedicated Google grant used only for YouTube discovery and Analytics reads. */
export const YOUTUBE_OAUTH_PROVIDER_ID = "google-youtube";
export const YOUTUBE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
] as const;

export const YOUTUBE_ANALYTICS_TIME_ZONE = "America/Los_Angeles" as const;

export type YouTubeDateRange = { startDate: string; endDate: string };
export type YouTubeMetricValue = number | null;
export type YouTubeOverviewMetrics = {
  views: YouTubeMetricValue;
  estimatedMinutesWatched: YouTubeMetricValue;
  averageViewDuration: YouTubeMetricValue;
  subscribersGained: YouTubeMetricValue;
  subscribersLost: YouTubeMetricValue;
  netSubscribers: YouTubeMetricValue;
  likes: YouTubeMetricValue;
  comments: YouTubeMetricValue;
  shares: YouTubeMetricValue;
};
export type YouTubeMetricComparison = Record<
  keyof YouTubeOverviewMetrics,
  {
    current: number | null;
    previous: number | null;
    absoluteChange: number | null;
    percentChange: number | null;
  }
>;
export type YouTubeChannelOverview = {
  status: "ok";
  source: {
    provider: "youtube_analytics";
    channelId: string;
    channelTitle: string;
    channelCustomUrl: string | null;
  };
  request: {
    requestedDateRange: YouTubeDateRange | null;
    resolvedDateRange: YouTubeDateRange;
    previousDateRange: YouTubeDateRange;
    timeZone: typeof YOUTUBE_ANALYTICS_TIME_ZONE;
  };
  current: YouTubeOverviewMetrics;
  previous: YouTubeOverviewMetrics;
  comparison: YouTubeMetricComparison;
  trend: Array<{ date: string; views: number | null }>;
  observedThrough: string | null;
  completeness: "complete" | "partial" | "unknown";
  retrievedAt: string;
  warnings: string[];
};
export const YOUTUBE_SELF_HOSTED_SETUP_DOCS_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_YOUTUBE.md";
