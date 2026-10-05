/** Better Auth provider ID for the dedicated Google Ads grant (read-only use). */
export const GOOGLE_ADS_OAUTH_PROVIDER_ID = "google-ads";

// The Google Ads API has a single scope, which also permits changes; Bodkin
// Search only ever reads (search queries), never mutates.
export const GOOGLE_ADS_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/adwords",
] as const;
