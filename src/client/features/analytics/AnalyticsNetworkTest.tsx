import { useMutation } from "@tanstack/react-query";
import { createAnalyticsDiagnosticToken } from "@/serverFunctions/analytics";
export function AnalyticsNetworkTest({ projectId }: { projectId: string }) {
  const token = useMutation({
    mutationFn: () => createAnalyticsDiagnosticToken({ data: { projectId } }),
  });
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://your-collector";
  return (
    <section className="space-y-3 border-t border-base-300 pt-6">
      <h3 className="font-medium">Compare website and product network</h3>
      <p className="text-sm text-base-content/70">
        Issue a ten-minute installation token, then request this endpoint from
        each actual client context. It observes the address at our collector.
        Redact the address from saved reports.
      </p>
      <button
        className="btn btn-sm btn-outline"
        disabled={token.isPending}
        onClick={() => token.mutate()}
      >
        Create temporary diagnostic token
      </button>
      {token.isError && (
        <p role="alert" className="text-sm">
          Network diagnostic is unavailable. Configure the network secret and
          use a workspace administrator account.
        </p>
      )}
      {token.data && (
        <pre className="overflow-x-auto rounded bg-base-200 p-3 text-xs">{`fetch("${origin}/api/analytics/diagnostics/ip", {\n  headers: {Authorization: "Bearer ${token.data.token}"}\n}).then(r => r.json())`}</pre>
      )}
    </section>
  );
}
