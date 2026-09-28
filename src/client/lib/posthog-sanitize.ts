const OAUTH_CONSENT_PATH = "/oauth-consent";

export const POSTHOG_PERSONAL_DATA_QUERY_PARAMETERS = [
  "email",
  "token",
  "redirect",
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
] as const;

export function sanitizePostHogUrl(value: string): string {
  try {
    const relative = value.startsWith("/");
    const url = new URL(
      value,
      relative ? "https://redaction.invalid" : undefined,
    );

    // The consent route carries the complete OAuth authorization request. Keep
    // only the route identity in analytics so current URLs, session-entry URLs,
    // referrers, and replay metadata cannot expose present or future params.
    if (
      url.pathname === OAUTH_CONSENT_PATH ||
      url.pathname === "/workspace-invitation"
    ) {
      url.search = "";
      url.hash = "";
      return relative ? url.pathname : url.toString();
    }

    // Preserve the existing email redaction for URLs outside the consent flow.
    url.searchParams.delete("email");
    url.searchParams.delete("token");
    if (url.searchParams.get("redirect")?.includes("workspace-invitation"))
      url.searchParams.delete("redirect");
    return relative
      ? `${url.pathname}${url.search}${url.hash}`
      : url.toString();
  } catch {
    return value;
  }
}

export function sanitizePostHogProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== "string") continue;
    properties[key] = sanitizePostHogUrl(value);
  }

  return properties;
}
