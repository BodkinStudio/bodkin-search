/* eslint-disable max-lines -- the inspector's bounded diagnostic views share one lazy disclosure boundary */
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

const DISMISSAL_REASON_LABELS = [
  ["irrelevant", "Irrelevant"],
  ["already_planned", "Already planned"],
  ["not_commercially_important", "Not commercially important"],
  ["insufficient_evidence", "Insufficient evidence"],
  ["wrong_diagnosis", "Wrong diagnosis"],
  ["too_much_effort", "Too much effort"],
  ["duplicate", "Duplicate"],
  ["defer", "Deferred"],
] as const;

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

function formatPercentage(value: number | null) {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-GB", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function GrowthMonitorCalibration({
  calibration,
}: {
  calibration: GrowthRunInspectorDto["calibration"];
}) {
  const counts = calibration.overall;
  const reasons = DISMISSAL_REASON_LABELS.filter(
    ([reason]) => counts.dismissalReasons[reason] > 0,
  );
  return (
    <section aria-labelledby="growth-monitor-calibration-heading">
      <h2 id="growth-monitor-calibration-heading" className="font-medium">
        Daily-monitor calibration
      </h2>
      <p className="mt-1 max-w-prose text-sm text-base-content/70">
        Review outcomes for up to the latest {calibration.limit}{" "}
        candidate-detector investigations. Only irrelevant,
        insufficient-evidence and wrong-diagnosis dismissals are treated as
        signal-quality false positives; accepted investigations are the
        comparison group.
      </p>
      {calibration.hasMore ? (
        <p className="mt-2 text-sm text-base-content/70">
          This cohort is capped; older candidate investigations are not shown.
        </p>
      ) : null}
      {counts.sampled === 0 ? (
        <p className="mt-3 text-sm text-base-content/70">
          No candidate investigation recommendations have been recorded yet, so
          classification coverage and the observed rate are unavailable.
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Sampled", counts.sampled],
              ["Classified", counts.classified],
              [
                "Classification coverage",
                formatPercentage(counts.classificationCoverage),
              ],
              ["Accepted", counts.accepted],
              ["False positives", counts.signalQualityFalsePositives],
              ["Observed rate", formatPercentage(counts.falsePositiveRate)],
              ["Other dismissals", counts.otherDismissals],
              ["Awaiting review", counts.unresolved],
              ["Reconciled", counts.reconciled],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-base-200 px-3 py-2">
                <dt className="text-xs text-base-content/65">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 overflow-x-auto">
            <table className="table table-sm">
              <caption className="sr-only">
                Calibration outcomes by persisted detector version
              </caption>
              <thead>
                <tr>
                  <th scope="col">Detector</th>
                  <th scope="col">Sampled</th>
                  <th scope="col">Classified</th>
                  <th scope="col">Classification coverage</th>
                  <th scope="col">Accepted</th>
                  <th scope="col">False positives</th>
                  <th scope="col">Other dismissals</th>
                  <th scope="col">Awaiting review</th>
                  <th scope="col">Reconciled</th>
                  <th scope="col">Observed rate</th>
                </tr>
              </thead>
              <tbody>
                {calibration.detectors.map((detector) => (
                  <tr key={detector.detectorVersion}>
                    <th scope="row" className="font-mono text-xs font-normal">
                      {detector.detectorVersion}
                    </th>
                    <td>{detector.sampled}</td>
                    <td>{detector.classified}</td>
                    <td>{formatPercentage(detector.classificationCoverage)}</td>
                    <td>{detector.accepted}</td>
                    <td>{detector.signalQualityFalsePositives}</td>
                    <td>{detector.otherDismissals}</td>
                    <td>{detector.unresolved}</td>
                    <td>{detector.reconciled}</td>
                    <td>{formatPercentage(detector.falsePositiveRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reasons.length ? (
            <p className="mt-2 text-xs text-base-content/65">
              Dismissal labels in this cohort:{" "}
              {reasons
                .map(
                  ([reason, label]) =>
                    `${label} ${counts.dismissalReasons[reason]}`,
                )
                .join(", ")}
              .
            </p>
          ) : null}
        </>
      )}
      <p className="mt-2 text-xs text-base-content/65">
        This is a review proxy, not ground truth. No automatic release threshold
        is applied.
      </p>
    </section>
  );
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

function GrowthMonthlyCycleEvidence({
  evidence,
}: {
  evidence: GrowthRunInspectorDto["monthlyCycleEvidence"];
}) {
  const continuity =
    evidence.latestPeriodsAdjacent === null
      ? "Insufficient evidence: fewer than two distinct monthly periods are visible."
      : evidence.latestPeriodsAdjacent
        ? "The latest two distinct visible monthly periods are calendar-adjacent."
        : "The latest two distinct visible monthly periods are not calendar-adjacent.";
  return (
    <section className="mt-6" aria-labelledby="monthly-cycle-evidence-heading">
      <h2 id="monthly-cycle-evidence-heading" className="font-medium">
        Monthly-cycle evidence
      </h2>
      <p className="mt-2 max-w-prose text-sm text-base-content/70">
        Saved evidence from monthly review runs, their exact priority-page child
        runs, version-one reports and child recommendation reviews.
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-md bg-base-200 px-3 py-2">
          <dt className="text-xs text-base-content/65">
            Distinct periods visible
          </dt>
          <dd className="font-medium tabular-nums">
            {evidence.distinctPeriods}
          </dd>
        </div>
        <div className="rounded-md bg-base-200 px-3 py-2">
          <dt className="text-xs text-base-content/65">Period continuity</dt>
          <dd>{continuity}</dd>
        </div>
      </dl>
      {evidence.hasMore ? (
        <p className="mt-3 text-sm text-base-content/70">
          Showing the latest {evidence.limit} monthly review runs. Older cycles
          are not shown.
        </p>
      ) : null}
      {evidence.cycles.length === 0 ? (
        <p className="mt-3 text-sm text-base-content/70">
          No saved monthly review cycles are available for this project.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="table table-sm">
            <caption className="sr-only">
              Saved monthly review cycle evidence
            </caption>
            <thead>
              <tr>
                <th scope="col">Monthly period</th>
                <th scope="col">Parent review</th>
                <th scope="col">Priority-page child</th>
                <th scope="col">Version-one report provenance</th>
                <th scope="col">Child recommendation reviews</th>
              </tr>
            </thead>
            <tbody>
              {evidence.cycles.map((cycle) => (
                <tr key={cycle.parent.id}>
                  <th scope="row">
                    {cycle.parent.periodStart}–{cycle.parent.periodEnd}
                  </th>
                  <td>
                    <p>{STATUS_LABELS[cycle.parent.status]}</p>
                    <p className="text-xs text-base-content/65">
                      {cycle.parent.trigger === "scheduled"
                        ? "Scheduled"
                        : "Manual"}
                    </p>
                    {cycle.parent.failure ? (
                      <p className="mt-1 text-xs text-warning">
                        {cycle.parent.failure.code}:{" "}
                        {cycle.parent.failure.message}
                      </p>
                    ) : null}
                  </td>
                  <td>
                    {cycle.child ? (
                      <>
                        <p>{STATUS_LABELS[cycle.child.status]}</p>
                        {cycle.child.failure ? (
                          <p className="mt-1 text-xs text-warning">
                            {cycle.child.failure.code}:{" "}
                            {cycle.child.failure.message}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      "No exact child run saved"
                    )}
                  </td>
                  <td>
                    {cycle.report ? (
                      <>
                        <p>
                          {cycle.report.status === "published"
                            ? "Published"
                            : "Draft"}
                        </p>
                        <p className="text-xs text-base-content/65">
                          {cycle.report.createdByType} provenance, generated{" "}
                          {formatTimestamp(cycle.report.generatedAt)}
                        </p>
                      </>
                    ) : (
                      "No exact version-one report saved"
                    )}
                  </td>
                  <td>
                    Accepted {cycle.recommendations.accepted}; dismissed{" "}
                    {cycle.recommendations.dismissed}; duplicate dismissals{" "}
                    {cycle.recommendations.duplicateDismissals}; awaiting review{" "}
                    {cycle.recommendations.unresolved}; reconciled{" "}
                    {cycle.recommendations.reconciled}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 max-w-prose text-xs text-base-content/65">
        This dossier is persisted operational evidence, not a Gate 4 verdict.
        Substantial manual preparation is not captured and still requires human
        and live validation.
      </p>
    </section>
  );
}

export function GrowthRunInspectorResults({
  data,
}: {
  data: GrowthRunInspectorDto;
}) {
  return (
    <div className="mt-4">
      <GrowthMonitorCalibration calibration={data.calibration} />
      <GrowthMonthlyCycleEvidence evidence={data.monthlyCycleEvidence} />
      <h2 className="mt-6 font-medium">Recent runs</h2>
      {data.runs.length === 0 ? (
        <p className="mt-2 text-sm text-base-content/70">
          No Growth runs have been recorded for this project.
        </p>
      ) : null}
      {data.hasMore ? (
        <p className="mb-3 text-sm text-base-content/70">
          Showing the latest {data.limit} runs. Older runs are not shown.
        </p>
      ) : null}
      <ol className="mt-3 space-y-3">
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
