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
