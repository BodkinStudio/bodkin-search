import { startGoogleLink } from "@/client/features/integrations/startGoogleLink";

export function YouTubeAnalyticsStatus({
  analyticsReady,
  canReconnect,
  disabled,
}: {
  analyticsReady: boolean;
  canReconnect: boolean;
  disabled: boolean;
}) {
  if (analyticsReady) {
    return (
      <p className="text-sm text-base-content/60">
        Read-only channel analytics are available on the dashboard and through
        MCP.
      </p>
    );
  }
  if (!canReconnect) {
    return (
      <p className="text-sm text-warning">
        Ask the person who connected this channel to reconnect, or change to a
        channel from one of your Google accounts.
      </p>
    );
  }
  return (
    <>
      <p className="text-sm text-warning">
        Reconnect with Google to enable YouTube Analytics reporting.
      </p>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => void startGoogleLink("youtube", window.location.href)}
        disabled={disabled}
      >
        Reconnect with Google
      </button>
    </>
  );
}
