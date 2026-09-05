/** Dedicated Google grant used only for YouTube channel discovery. */
export const YOUTUBE_OAUTH_PROVIDER_ID = "google-youtube";
export const YOUTUBE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;
export const YOUTUBE_SELF_HOSTED_SETUP_DOCS_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_YOUTUBE.md";
