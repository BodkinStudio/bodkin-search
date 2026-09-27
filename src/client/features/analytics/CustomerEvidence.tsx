import { AnalyticsCorrectionForm } from "./AnalyticsCorrectionForm";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsCustomerEvidence } from "@/serverFunctions/analytics";
export function CustomerEvidence({
  projectId,
  customerId,
  environment,
  onOpenJourney,
}: {
  projectId: string;
  customerId: string;
  environment: "production" | "test";
  onOpenJourney: (context: string) => void;
}) {
  const query = useQuery({
    queryKey: ["analyticsEvidence", projectId, customerId, environment],
    queryFn: () =>
      getAnalyticsCustomerEvidence({
        data: { projectId, customerId, environment },
      }),
  });
  if (query.isPending)
    return <p role="status">Loading acquisition evidence…</p>;
  if (query.isError)
    return (
      <p role="alert">Evidence is unavailable or your access has changed.</p>
    );
  const data = query.data;
  return (
    <div className="space-y-3 p-3 text-sm">
      <p className="font-medium">
        {data.customerLabel} · {data.environment}
      </p>
      <p>
        {data.method === "ip_time"
          ? "Inferred acquisition only. This does not identify the website visitor."
          : data.method === "exact"
            ? "Acquisition linked through a verified context."
            : data.method === "manual"
              ? "Manually assigned acquisition. This does not establish verified personal identity."
              : "No eligible acquisition link was found."}
      </p>
      <p className="text-base-content/70">
        Reason: {data.reason.replaceAll("_", " ")}
      </p>
      {data.click && (
        <div>
          <p>
            {data.click.source ?? "Direct / unknown"} · {data.click.pagePath} ·{" "}
            {data.click.campaign}
          </p>
          <button
            className="mt-2 text-primary hover:underline"
            onClick={() => onOpenJourney(data.click!.contextId)}
          >
            Inspect {data.method === "ip_time" ? "inferred source" : "source"}{" "}
            journey
          </button>
        </div>
      )}
      {data.contextId && (
        <button
          className="text-primary hover:underline"
          onClick={() => onOpenJourney(data.contextId!)}
        >
          Inspect verified product context
        </button>
      )}
      <ol className="space-y-2">
        {data.decisions.map((d) => (
          <li key={d.version} className="rounded border border-base-300 p-3">
            Decision {d.version} · {d.method} · rule {d.ruleVersion}
            <br />
            {d.candidateGroupCount} eligible journey groups
            {d.elapsedMs !== null
              ? ` · ${Math.round(d.elapsedMs / 60000)} minutes from click to entry`
              : ""}
            <span className="block text-xs text-base-content/60">
              {d.createdAt}
            </span>
          </li>
        ))}
      </ol>
      <AnalyticsCorrectionForm
        projectId={projectId}
        customerId={customerId}
        version={data.decisionVersion}
        clickEventId={data.clickEventId}
      />
      <h4 className="font-medium">Integration delivery</h4>
      {data.deliveries.map((d) => (
        <p key={d.version}>
          Version {d.version}:{" "}
          {d.deliveredAt
            ? `Delivered ${d.deliveredAt.slice(0, 16).replace("T", " ")}`
            : (d.lastError ??
              "Queued · configure an approved webhook destination")}{" "}
          ({d.attempts} {d.attempts === 1 ? "attempt" : "attempts"})
        </p>
      ))}
    </div>
  );
}
