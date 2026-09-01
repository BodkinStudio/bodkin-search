import type {
  GrowthWorkMeasurementCandidate,
  GrowthWorkMeasurementOverview,
  GrowthWorkMeasurementPlan,
} from "@/types/schemas/growth-work";
import { GrowthChangeHistory } from "./GrowthChangeHistory";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";
import {
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
}: {
  data: GrowthWorkMeasurementOverview;
  frozenCandidate?: GrowthWorkMeasurementCandidate;
  selectedId?: string;
  disabled: boolean;
  pending: boolean;
  onSubmit: (implementationChangeEventId: string) => void;
}) {
  if (data.state === "inconsistent")
    return (
      <p role="alert">
        The saved Work and measurement state do not agree. Refresh measurement
        before taking another action.
      </p>
    );
  if (data.plan) return <GrowthWorkMeasurementPlanView plan={data.plan} />;
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
}: {
  plan: GrowthWorkMeasurementPlan;
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
          This plan is saved. Google data collection and result calculation are
          later steps.
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
      {plan.result ? (
        <GrowthWorkMeasurementResult result={plan.result} />
      ) : null}
    </div>
  );
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
