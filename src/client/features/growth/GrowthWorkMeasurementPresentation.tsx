import type { ReactNode } from "react";
import type {
  GrowthWorkMeasurementCandidate,
  GrowthWorkMeasurementOverview,
  GrowthWorkMeasurementPlan,
} from "@/types/schemas/growth-work";
import { GrowthChangeHistory } from "./GrowthChangeHistory";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";
import {
  GROWTH_MEASUREMENT_METRIC_LABELS,
  GrowthWorkMeasurementForm,
  GrowthWorkMeasurementScheduleDetails,
} from "./GrowthWorkMeasurementForm";

export function GrowthWorkMeasurementContent({
  data,
  frozenCandidate,
  selectedId,
  disabled,
  pending,
  onSubmit,
  collectionControl,
}: {
  data: GrowthWorkMeasurementOverview;
  frozenCandidate?: GrowthWorkMeasurementCandidate;
  selectedId?: string;
  disabled: boolean;
  pending: boolean;
  onSubmit: (implementationChangeEventId: string) => void;
  collectionControl?: ReactNode;
}) {
  if (data.state === "inconsistent")
    return (
      <p role="alert">
        The saved Work and measurement state do not agree. Refresh measurement
        before taking another action.
      </p>
    );
  if (data.plan)
    return (
      <GrowthWorkMeasurementPlanView
        plan={data.plan}
        collectionControl={collectionControl}
      />
    );
  if (data.state === "not_ready")
    return (
      <p className="text-base-content/70">
        Mark this investigation Done before starting measurement.
      </p>
    );
  if (data.state === "unmeasurable_targets")
    return (
      <p role="alert">
        This Work does not have a supported set of page targets for measurement.
      </p>
    );
  if (data.state === "needs_change")
    return (
      <p className="text-base-content/70">
        {data.candidates.length
          ? "Linked changes with future dates cannot start measurement. Link a completed page change, then refresh measurement."
          : "No manual page change is linked to this Work. Link one under Related page changes, then refresh measurement."}
      </p>
    );
  if (data.state !== "eligible" && !frozenCandidate) return null;
  return (
    <GrowthWorkMeasurementForm
      candidates={frozenCandidate ? [frozenCandidate] : data.candidates}
      selectedId={selectedId}
      targetCount={data.targetCount}
      metrics={data.proposedMetrics}
      disabled={disabled}
      pending={pending}
      onSubmit={onSubmit}
    />
  );
}

function GrowthWorkMeasurementPlanView({
  plan,
  collectionControl,
}: {
  plan: GrowthWorkMeasurementPlan;
  collectionControl?: ReactNode;
}) {
  return (
    <div className="border-t border-base-300 pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold">Measurement plan</h4>
        <p className="text-xs font-medium">
          {plan.status === "active" ? "Measuring" : "Evaluated"}
        </p>
      </div>
      {plan.status === "active" ? (
        <p className="mt-2 text-base-content/70">
          This plan is saved. Search Console is read only when you choose to
          collect an available period; a measured comparison does not establish
          cause.
        </p>
      ) : null}
      {plan.implementationChange ? (
        <GrowthChangeHistory
          changes={[plan.implementationChange]}
          limit={1}
          headingLevel={4}
          title="Measurement anchor"
          caption="This recorded change anchors the comparison timeline. It does not show that the change caused a result."
        />
      ) : (
        <p className="mt-3 text-base-content/70">
          This plan predates linked-change anchors. Its saved schedule remains
          unchanged.
        </p>
      )}
      <GrowthWorkMeasurementScheduleDetails
        schedule={plan.schedule}
        targetCount={plan.metrics.filter(({ isPrimary }) => isPrimary).length}
        metrics={plan.metrics}
        dueDate={plan.dueDate}
      />
      <GrowthWorkMeasurementCollectionProgress plan={plan} />
      {collectionControl}
      <GrowthWorkMeasurementComparisons plan={plan} />
      {plan.result ? (
        <GrowthWorkMeasurementResult result={plan.result} />
      ) : null}
    </div>
  );
}

function GrowthWorkMeasurementCollectionProgress({
  plan,
}: {
  plan: GrowthWorkMeasurementPlan;
}) {
  return (
    <div className="mt-5 border-t border-base-300 pt-4">
      <h4 className="font-semibold">Search Console evidence</h4>
      <p className="mt-1 text-xs text-base-content/70">
        Google final data is collected after a three-day Pacific-calendar lag.
        Missing page rows are not treated as zero.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="table table-sm">
          <caption className="sr-only">
            Collection status for each measurement period
          </caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Saved dates</th>
              <th scope="col">Google available</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {plan.collection.periods.map((period) => (
              <tr key={period.periodType}>
                <th scope="row" className="font-medium">
                  {periodLabel(period.periodType)}
                </th>
                <td className="tabular-nums">
                  {formatGrowthPreviewDate(period.startDate)} –{" "}
                  {formatGrowthPreviewDate(period.endDate)}
                </td>
                <td className="tabular-nums">
                  {formatGrowthPreviewDate(period.sourceAvailableOn)}
                </td>
                <td>{collectionPeriodStatus(period)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GrowthWorkMeasurementComparisons({
  plan,
}: {
  plan: GrowthWorkMeasurementPlan;
}) {
  if (!plan.metrics.some(({ observations }) => observations.length > 0))
    return null;
  return (
    <div className="mt-5 border-t border-base-300 pt-4">
      <h4 className="font-semibold">Observed comparison</h4>
      <p className="mt-1 text-xs text-base-content/70">
        These are stored Search Console observations, not proof that the
        recorded change caused the difference.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="table table-sm">
          <caption className="sr-only">
            Baseline, primary and long-term measurement values
          </caption>
          <thead>
            <tr>
              <th scope="col">Metric and page</th>
              <th scope="col" className="text-right">
                Baseline
              </th>
              <th scope="col" className="text-right">
                Primary
              </th>
              <th scope="col" className="text-right">
                Change
              </th>
              <th scope="col" className="text-right">
                Long-term
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.metrics.map((metric, index) => (
              <tr key={`${metric.metricType}:${metric.displayTarget}:${index}`}>
                <th scope="row" className="min-w-56 font-medium">
                  <span className="block">
                    {GROWTH_MEASUREMENT_METRIC_LABELS[metric.metricType]}
                    {metric.isPrimary ? " (primary)" : " (context)"}
                  </span>
                  <span className="block max-w-80 break-all text-xs font-normal text-base-content/60">
                    {metric.displayTarget ?? "Target withheld"}
                  </span>
                </th>
                <td className="text-right tabular-nums">
                  {formatMetricValue(
                    metric.metricType,
                    metric.comparison.baselineValue,
                  )}
                </td>
                <td className="text-right tabular-nums">
                  {formatMetricValue(
                    metric.metricType,
                    metric.comparison.measurementValue,
                  )}
                </td>
                <td className="text-right tabular-nums">
                  {formatComparisonDelta(metric)}
                </td>
                <td className="text-right tabular-nums">
                  {formatMetricValue(
                    metric.metricType,
                    metric.comparison.longTermValue,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function collectionPeriodStatus(
  period: GrowthWorkMeasurementPlan["collection"]["periods"][number],
) {
  if (period.status === "collected")
    return `Collected (${period.collectedMetricCount}/${period.expectedMetricCount} metrics)`;
  if (period.status === "ready") return "Ready to collect";
  if (period.status === "not_collected")
    return `Not collected (${period.collectedMetricCount}/${period.expectedMetricCount} metrics)`;
  if (period.status === "inconsistent") return "Needs attention";
  return "Waiting for Google data";
}

function periodLabel(
  periodType: GrowthWorkMeasurementPlan["collection"]["periods"][number]["periodType"],
) {
  return periodType === "baseline"
    ? "Baseline"
    : periodType === "measurement"
      ? "Primary"
      : "Long-term";
}

function formatMetricValue(
  metricType: GrowthWorkMeasurementPlan["metrics"][number]["metricType"],
  value: number | null,
) {
  if (value === null) return "Not collected";
  if (metricType === "search_ctr" || metricType === "organic_engagement_rate")
    return `${(value * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
  if (metricType === "search_average_position")
    return value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  return value.toLocaleString("en-GB");
}

function formatComparisonDelta(
  metric: GrowthWorkMeasurementPlan["metrics"][number],
) {
  const { absoluteDelta, percentDelta } = metric.comparison;
  if (absoluteDelta === null) return "Not available";
  const absolute = formatMetricValue(metric.metricType, absoluteDelta);
  if (percentDelta === null) return `${signed(absoluteDelta)}${absolute}`;
  const percent = Math.abs(percentDelta).toLocaleString("en-GB", {
    maximumFractionDigits: 1,
  });
  return `${signed(absoluteDelta)}${absolute} (${signed(percentDelta)}${percent}%)`;
}

function signed(value: number) {
  return value > 0 ? "+" : "";
}

function GrowthWorkMeasurementResult({
  result,
}: {
  result: NonNullable<GrowthWorkMeasurementPlan["result"]>;
}) {
  return (
    <div className="mt-5 border-t border-base-300 pt-4">
      <h4 className="font-semibold">Measured result</h4>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <dt className="text-xs text-base-content/70">Outcome</dt>
          <dd className="font-medium">{result.outcome.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt className="text-xs text-base-content/70">Confidence</dt>
          <dd className="font-medium tabular-nums">
            {Math.round(result.confidence * 100)}%
          </dd>
        </div>
        <div>
          <dt className="text-xs text-base-content/70">Evaluated (UTC)</dt>
          <dd className="font-medium tabular-nums">
            {formatGrowthPreviewDate(result.evaluatedAt)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 max-w-prose whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {result.summary}
      </p>
    </div>
  );
}
