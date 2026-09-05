export type YouTubeApiFailure =
  | "unauthorized"
  | "forbidden"
  | "quota"
  | "transport"
  | "upstream";
export class YouTubeTokenError extends Error {
  constructor() {
    super("Could not mint a YouTube access token.");
    this.name = "YouTubeTokenError";
  }
}
export class YouTubeApiError extends Error {
  constructor(
    readonly status: number,
    readonly failure: YouTubeApiFailure,
    readonly retryAfterSeconds: number | null = null,
    readonly upstreamReason:
      | "SERVICE_DISABLED"
      | "INSUFFICIENT_PERMISSIONS"
      | "QUOTA_EXCEEDED"
      | "REPORT_INCOMPATIBLE"
      | null = null,
  ) {
    super(`YouTube API ${failure} error (${status}).`);
    this.name = "YouTubeApiError";
  }
}
export class YouTubeMalformedResponseError extends Error {
  constructor() {
    super("YouTube returned an invalid response.");
    this.name = "YouTubeMalformedResponseError";
  }
}

type YouTubeReportErrorCode =
  | "validation_error"
  | "youtube_not_connected"
  | "youtube_reconnect_required"
  | "youtube_channel_inaccessible"
  | "youtube_analytics_not_enabled"
  | "youtube_report_incompatible"
  | "youtube_quota_exhausted"
  | "youtube_upstream_unavailable"
  | "youtube_malformed_response";

export class YouTubeReportError extends Error {
  constructor(
    readonly code: YouTubeReportErrorCode,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "YouTubeReportError";
  }
}
