import { useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  getGrowthCheckEvidence,
  type getGrowthCheckRun,
} from "@/serverFunctions/growthChecks";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";
import { GrowthInvestigation } from "./GrowthInvestigation";

export function GrowthCheckDetail({
  query,
  projectId,
}: {
  query: UseQueryResult<Awaited<ReturnType<typeof getGrowthCheckRun>>>;
  projectId: string;
}) {
  if (!query.isEnabled)
    return (
      <div className="rounded-md border border-base-300 p-4 text-sm text-base-content/70">
        Select a saved check to inspect its persisted results.
      </div>
    );
  if (query.isPending)
    return (
      <div
        role="status"
        aria-busy="true"
        className="rounded-md border border-base-300 p-4"
      >
        Loading saved results…
      </div>
    );
  if (query.isError)
    return (
      <div role="alert" className="alert alert-error">
        This saved check could not be opened.
      </div>
    );
  const { run, signals } = query.data;
  if (run.status === "running")
    return (
      <div
        role="status"
        className="rounded-md border border-base-300 p-4 text-sm"
      >
        This saved check is still marked running. Its completion is unknown; no
        background completion is promised. Refresh saved results or start a new
        check when appropriate.
      </div>
    );
  if (run.status === "failed")
    return (
      <div role="alert" className="alert alert-error">
        <span>
          {run.failureMessage ??
            "This check failed. Start a new explicit check after resolving the connection."}
        </span>
      </div>
    );
  return (
    <div className="min-w-0 rounded-md border border-base-300 p-4">
      <h3 className="font-semibold">Detected declines</h3>
      {run.status === "completed_with_errors" ? (
        <p role="status" className="alert alert-warning mt-2 text-sm">
          {run.failureMessage ??
            "This result is incomplete or limited; it is not an all-clear."}
        </p>
      ) : null}
      {signals.length === 0 ? (
        <p className="mt-2 text-sm text-base-content/70">
          No declines were saved. This does not prove every priority page is
          healthy.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {signals.map((signal) => (
            <li key={signal.id} className="border-t border-base-300 pt-3">
              <p className="break-all font-medium">
                {signal.displayUrl ?? "Priority page URL unavailable"}
              </p>
              <p className="mt-1 break-all text-xs text-base-content/70">
                Current configured URL · Page reference: {signal.entityRef}
              </p>
              <dl className="mt-2 space-y-2 text-sm tabular-nums">
                <div>
                  <dt className="text-base-content/70">
                    Baseline:{" "}
                    {formatGrowthPreviewDate(signal.baselinePeriod.startDate)}
                    {" – "}
                    {formatGrowthPreviewDate(signal.baselinePeriod.endDate)}
                  </dt>
                  <dd className="font-medium">{signal.baselineValue} clicks</dd>
                </div>
                <div>
                  <dt className="text-base-content/70">
                    Current:{" "}
                    {formatGrowthPreviewDate(signal.currentPeriod.startDate)}
                    {" – "}
                    {formatGrowthPreviewDate(signal.currentPeriod.endDate)}
                  </dt>
                  <dd className="font-medium">
                    {signal.currentValue} clicks (
                    {signal.deltaPercent?.toFixed(1)}%)
                  </dd>
                </div>
              </dl>
              <GrowthEvidence projectId={projectId} signalId={signal.id} />
              <GrowthInvestigation projectId={projectId} signalId={signal.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GrowthEvidence({
  projectId,
  signalId,
}: {
  projectId: string;
  signalId: string;
}) {
  const [open, setOpen] = useState(false);
  const evidence = useQuery({
    queryKey: ["growthCheckEvidence", projectId, signalId],
    queryFn: () => getGrowthCheckEvidence({ data: { projectId, signalId } }),
    enabled: open,
    retry: false,
  });
  return (
    <details
      className="mt-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-medium">
        Saved evidence
      </summary>
      {open && evidence.isPending ? (
        <p role="status" className="mt-2 text-sm">
          Loading evidence…
        </p>
      ) : null}
      {evidence.isSuccess ? (
        <div className="mt-2 space-y-2 text-sm text-base-content/70">
          <p className="break-all">
            {evidence.data.subject.displayUrl ?? "Page URL withheld"}
          </p>
          <p>
            Observed{" "}
            {formatGrowthPreviewDate(
              evidence.data.observation.baselinePeriod.startDate,
            )}{" "}
            to{" "}
            {formatGrowthPreviewDate(
              evidence.data.observation.currentPeriod.endDate,
            )}
            ; captured {evidence.data.observation.capturedAt}. Search Console
            web data, Pacific calendar.
          </p>
          <p>
            Current project context (not historical):{" "}
            {evidence.data.currentCommercialContext.sections
              .map(
                (section) =>
                  `${section.key}: ${section.content ?? "not provided"}${section.updatedAt ? ` (updated ${section.updatedAt})` : ""}`,
              )
              .join("; ")}
          </p>
          <ul className="list-disc pl-5">
            {evidence.data.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {evidence.isError ? (
        <p role="alert" className="mt-2 text-sm text-error">
          Saved evidence could not be opened.
        </p>
      ) : null}
    </details>
  );
}
