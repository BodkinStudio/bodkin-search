import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGrowthRunInspector } from "@/serverFunctions/growthRunInspector";
import type { GrowthRunInspectorDto } from "@/types/schemas/growth-run-inspector";

const RUN_TYPE_LABELS: Record<
  GrowthRunInspectorDto["runs"][number]["runType"],
  string
> = {
  daily_monitor: "Daily monitor",
  weekly_review: "Weekly review",
  monthly_review: "Monthly review",
  measurement_review: "Measurement review",
  manual_analysis: "Manual analysis",
};

const STATUS_LABELS: Record<
  GrowthRunInspectorDto["runs"][number]["status"],
  string
> = {
  running: "Running",
  completed: "Completed",
  completed_with_errors: "Completed with errors",
  failed: "Failed",
};

export function formatGrowthRunDuration(durationMs: number) {
  if (durationMs < 1_000) return "<1s";
  const seconds = Math.floor(durationMs / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function EntityCounts({
  entities,
}: {
  entities: GrowthRunInspectorDto["runs"][number]["entities"];
}) {
  const counts = [
    ["Signals", entities.signals],
    ["Insights", entities.insights],
    ["Recommendations", entities.recommendations],
    ["Linked Actions", entities.linkedActions],
  ];
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {counts.map(([label, value]) => (
        <div key={label} className="rounded-md bg-base-200 px-3 py-2">
          <dt className="text-xs text-base-content/65">{label}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function GrowthRunInspectorResults({
  data,
}: {
  data: GrowthRunInspectorDto;
}) {
  if (data.runs.length === 0)
    return (
      <p className="mt-4 text-sm text-base-content/70">
        No Growth runs have been recorded for this project.
      </p>
    );
  return (
    <div className="mt-4">
      {data.hasMore ? (
        <p className="mb-3 text-sm text-base-content/70">
          Showing the latest {data.limit} runs. Older runs are not shown.
        </p>
      ) : null}
      <ol className="space-y-3">
        {data.runs.map((run) => (
          <li key={run.id}>
            <article className="rounded-lg border border-base-300 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">
                    {RUN_TYPE_LABELS[run.runType]}
                  </h3>
                  <p className="mt-1 break-all font-mono text-xs text-base-content/65">
                    {run.id}
                  </p>
                </div>
                <span className="badge badge-outline">
                  {STATUS_LABELS[run.status]}
                </span>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-base-content/65">Period</dt>
                  <dd>
                    {run.periodStart}–{run.periodEnd}
                  </dd>
                </div>
                <div>
                  <dt className="text-base-content/65">Started (UTC)</dt>
                  <dd>{formatTimestamp(run.startedAt)}</dd>
                </div>
                <div>
                  <dt className="text-base-content/65">Duration</dt>
                  <dd>{formatGrowthRunDuration(run.durationMs)}</dd>
                </div>
                <div>
                  <dt className="text-base-content/65">Trigger</dt>
                  <dd>
                    {run.trigger === "scheduled" ? "Scheduled" : "Manual"}
                  </dd>
                </div>
                <div>
                  <dt className="text-base-content/65">Detector</dt>
                  <dd className="break-all font-mono text-xs">
                    {run.detectorVersion}
                  </dd>
                </div>
                <div>
                  <dt className="text-base-content/65">Analysis</dt>
                  <dd className="break-all font-mono text-xs">
                    {run.analysisVersion ?? "Not used"}
                  </dd>
                </div>
                <div>
                  <dt className="text-base-content/65">Provider cost</dt>
                  <dd>
                    {run.providerCostMinor === null
                      ? "Not recorded"
                      : `${run.providerCostMinor} minor units`}
                  </dd>
                </div>
              </dl>
              <EntityCounts entities={run.entities} />
              {run.failure ? (
                <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                  <p className="font-medium">{run.failure.code}</p>
                  <p className="mt-1 text-base-content/75">
                    {run.failure.message}
                  </p>
                </div>
              ) : null}
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GrowthRunInspector({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["growthRunInspector", projectId],
    queryFn: () => getGrowthRunInspector({ data: { projectId } }),
    enabled: open,
    retry: false,
  });
  return (
    <details
      id="growth-run-inspector"
      className="rounded-lg border border-base-300 bg-base-100 px-4 py-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">Run inspector</summary>
      <div className="mt-3 border-t border-base-300 pt-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-prose text-sm text-base-content/70">
            Developer diagnostics from saved project runs. Opening this section
            does not start or resume any work.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Refreshing runs…" : "Refresh runs"}
          </button>
        </div>
        {query.isPending ? (
          <p role="status" aria-busy="true" className="mt-4 text-sm">
            Loading recent runs…
          </p>
        ) : null}
        {query.isError ? (
          <div role="alert" className="alert alert-error mt-4 flex-wrap">
            <p className="flex-1">Recent runs could not be loaded.</p>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void query.refetch()}
            >
              Retry run history
            </button>
          </div>
        ) : null}
        {query.data ? <GrowthRunInspectorResults data={query.data} /> : null}
      </div>
    </details>
  );
}
