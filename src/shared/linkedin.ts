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

export type LinkedInMetricChanges = Record<
  LinkedInCountMetricName,
  LinkedInMetric
>;

export type LinkedInImportSource = {
  provider: "linkedin_page_content_manual";
  pageName: string;
  startDate: string;
  endDate: string;
  importedAt: string;
  rowCount: number;
};

export type LinkedInReportWarning =
  | "partial_current_metric_values"
  | "partial_previous_metric_values"
  | "no_exact_adjacent_prior_import";

export type LinkedInPageOverview = {
  status: "ok";
  projectId: string;
  source: LinkedInImportSource;
  current: LinkedInMetricTotals;
  previous: LinkedInMetricTotals | null;
  comparison: LinkedInMetricChanges | null;
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
    code: "linkedin_no_import";
    message: string;
    actionUrl: string;
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
