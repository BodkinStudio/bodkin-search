export const LINKEDIN_COUNT_METRIC_NAMES = [
  "impressions",
  "membersReached",
  "videoViews",
  "clicks",
  "reactions",
  "comments",
  "reposts",
  "follows",
] as const;

export type LinkedInCountMetricName =
  (typeof LINKEDIN_COUNT_METRIC_NAMES)[number];
export type LinkedInMetric = number | null;

export type LinkedInMetricTotals = Record<
  LinkedInCountMetricName,
  LinkedInMetric
>;

/** Page-level totals. Manual post rows intentionally do not gain this field. */
export type LinkedInPageMetricTotals = LinkedInMetricTotals & {
  pageViews: LinkedInMetric;
};

export type LinkedInMetricChanges = Record<
  LinkedInCountMetricName,
  LinkedInMetric
>;

type LinkedInImportSource = {
  provider: "linkedin_page_content_manual";
  pageName: string;
  startDate: string;
  endDate: string;
  importedAt: string;
  rowCount: number;
};

type LinkedInApiSource = {
  provider: "linkedin_api";
  page: { id: string; name: string };
  dateRange: { start: string; end: string };
  previousDateRange: { start: string; end: string };
  retrievedAt: string;
  apiVersion: typeof LINKEDIN_MARKETING_API_VERSION;
  freshness: "fresh" | "stale";
  /** API rows are eligible for deletion after this instant. */
  retainUntil: string;
};

export type LinkedInOverviewSource = LinkedInImportSource | LinkedInApiSource;

export type LinkedInReportWarning =
  | "partial_current_metric_values"
  | "partial_previous_metric_values"
  | "no_exact_adjacent_prior_import"
  | "api_refresh_failed";

export type LinkedInPageOverview = {
  status: "ok";
  projectId: string;
  source: LinkedInOverviewSource;
  current: LinkedInPageMetricTotals;
  previous: LinkedInPageMetricTotals | null;
  comparison: (LinkedInMetricChanges & { pageViews: LinkedInMetric }) | null;
  completeness: "complete" | "partial";
  warnings: LinkedInReportWarning[];
};

export type LinkedInPostPerformanceItem = {
  postUrl: string | null;
  postText: string | null;
  publishedAt: string | null;
  impressions: LinkedInMetric;
  membersReached: LinkedInMetric;
  videoViews: LinkedInMetric;
  clicks: LinkedInMetric;
  reactions: LinkedInMetric;
  comments: LinkedInMetric;
  reposts: LinkedInMetric;
  follows: LinkedInMetric;
  providerClickThroughRate: LinkedInMetric;
  providerEngagementRate: LinkedInMetric;
};

export type LinkedInPostPerformance = LinkedInPageOverview & {
  posts: LinkedInPostPerformanceItem[];
};

export type LinkedInReportError = {
  status: "error";
  projectId: string;
  error: {
    code:
      | "linkedin_no_import"
      | "not_configured"
      | "not_connected"
      | "reconnect_required"
      | "page_inaccessible"
      | "rate_limited"
      | "malformed"
      | "upstream"
      | "transport";
    message: string;
    actionUrl: string;
    retryAfterSeconds?: number;
  };
};

export type LinkedInPageOverviewResult =
  | LinkedInPageOverview
  | LinkedInReportError;

export type LinkedInPostPerformanceResult =
  | LinkedInPostPerformance
  | LinkedInReportError;

export type LinkedInImportResult =
  | {
      status: "ok";
      importId: string;
      rowCount: number;
      replaced: boolean;
    }
  | {
      status: "error";
      error: {
        code: "linkedin_import_failed";
        message: string;
      };
    };
/** Dedicated, read-only grant for LinkedIn company Page reporting. */
export const LINKEDIN_OAUTH_PROVIDER_ID = "linkedin-page-analytics";
export const LINKEDIN_OAUTH_SCOPES = ["rw_organization_admin"] as const;
export const LINKEDIN_MARKETING_API_VERSION = "202608" as const;
export const LINKEDIN_RESTLI_PROTOCOL_VERSION = "2.0.0" as const;
export const LINKEDIN_API_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
export const LINKEDIN_API_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
