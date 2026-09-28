import { Link } from "@tanstack/react-router";

export function YouTubeReportErrorState({
  projectId,
  code,
  message,
  retry,
}: {
  projectId: string;
  code: string;
  message: string;
  retry: () => void;
}) {
  const actionable = [
    "youtube_reconnect_required",
    "youtube_channel_inaccessible",
    "youtube_not_connected",
  ].includes(code);
  const retryable = [
    "youtube_quota_exhausted",
    "youtube_upstream_unavailable",
  ].includes(code);
  const copy =
    code === "youtube_reconnect_required"
      ? "Reconnect with Google to restore YouTube Analytics access."
      : code === "youtube_channel_inaccessible"
        ? "The connected Google account can no longer access this YouTube channel."
        : code === "youtube_quota_exhausted"
          ? "YouTube's quota or rate limit prevented this report. Try again later."
          : code === "youtube_upstream_unavailable"
            ? "YouTube Analytics is temporarily unavailable. Try again shortly."
            : message;

  return (
    <div role="alert" className="space-y-2 text-sm text-base-content/60">
      <p>{copy}</p>
      {actionable ? (
        <Link
          to="/p/$projectId/settings/integrations"
          params={{ projectId }}
          hash="youtube"
          className="link link-primary"
        >
          Manage connection
        </Link>
      ) : null}
      {retryable ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
