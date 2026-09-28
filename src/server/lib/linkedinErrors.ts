type LinkedInApiFailure =
  | "not_connected"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "transport"
  | "upstream"
  | "malformed";
export class LinkedInApiError extends Error {
  constructor(
    public readonly failure: LinkedInApiFailure,
    public readonly status = 0,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(`LinkedIn API ${failure}`);
  }
}
