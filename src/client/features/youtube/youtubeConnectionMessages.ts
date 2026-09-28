type AccountFailure =
  | "forbidden"
  | "quota"
  | "transport"
  | "upstream"
  | "malformed"
  | null;

export function unavailableMessage(
  accounts: Array<{ unavailable: AccountFailure }>,
) {
  const failures = new Set(
    accounts.flatMap((account) =>
      account.unavailable ? [account.unavailable] : [],
    ),
  );
  if (failures.has("quota")) {
    return "YouTube's quota or rate limit prevented some channels from loading. Try again later.";
  }
  if (failures.has("forbidden")) {
    return "Some channels could not load. Check that the YouTube Data API is enabled and the Google account has access.";
  }
  if (failures.has("malformed")) {
    return "YouTube returned an invalid channel response. Try again later.";
  }
  return "YouTube is temporarily unavailable for some Google accounts. Try again later.";
}
