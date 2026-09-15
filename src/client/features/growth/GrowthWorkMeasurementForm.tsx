import { useId } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { getFieldError } from "@/client/lib/forms";
import type {
  GrowthWorkMeasurementCandidate,
  GrowthWorkMeasurementMetric,
  GrowthWorkMeasurementPlan,
  GrowthWorkMeasurementSchedule,
} from "@/types/schemas/growth-work";
import { GrowthChangeHistory } from "./GrowthChangeHistory";
import { GROWTH_CHANGE_LABELS } from "./GrowthChangePresentation";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";

export const GROWTH_MEASUREMENT_METRIC_LABELS: Record<
  GrowthWorkMeasurementPlan["metrics"][number]["metricType"],
  string
> = {
  search_clicks: "Search clicks",
  search_impressions: "Search impressions",
  search_ctr: "Search click-through rate",
  search_average_position: "Search average position",
  organic_sessions: "Organic sessions",
  organic_active_users: "Organic active users",
  organic_engagement_rate: "Organic engagement rate",
  organic_key_events: "Organic key events",
  backlink_count: "Backlinks",
  referring_domain_count: "Referring domains",
  audit_issue_page_count: "Pages with audit issues",
};

export function GrowthWorkMeasurementForm({
  candidates,
  selectedId,
  targetCount,
  metrics,
  disabled,
  pending,
  onSubmit,
}: {
  candidates: GrowthWorkMeasurementCandidate[];
  selectedId?: string;
  targetCount: number;
  metrics: GrowthWorkMeasurementMetric[];
  disabled: boolean;
  pending: boolean;
  onSubmit: (implementationChangeEventId: string) => void;
}) {
  const id = useId();
  const schema = z.object({
    implementationChangeEventId: z
      .string()
      .refine(
        (value) =>
          candidates.some(
            (candidate) =>
              candidate.change.id === value && candidate.schedule !== null,
          ),
        "Choose an available linked change",
      ),
  });
  const form = useForm({
    defaultValues: { implementationChangeEventId: selectedId ?? "" },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => {
      if (!disabled) onSubmit(schema.parse(value).implementationChangeEventId);
    },
  });

  return (
    <form
      noValidate
      aria-label="Start measurement from a recorded page change"
      className="max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) void form.handleSubmit();
      }}
    >
      <p id={`${id}-hint`} className="text-base-content/70">
        Choose one linked manual change. Its saved date becomes the measurement
        anchor; this does not claim the change caused later movement.
      </p>
      <fieldset disabled={disabled} className="mt-3 min-w-0 space-y-4">
        <form.Field name="implementationChangeEventId">
          {(field) => {
            const error = getFieldError(field.state.meta.errors);
            const selected = candidates.find(
              (candidate) => candidate.change.id === field.state.value,
            );
            return (
              <div>
                <label htmlFor={`${id}-change`} className="font-medium">
                  Website change to measure from
                </label>
                <select
                  id={`${id}-change`}
                  required
                  className="select select-bordered mt-1 w-full"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(event.currentTarget.value)
                  }
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
                >
                  <option value="">Choose a linked change</option>
                  {candidates.map((candidate) => (
                    <option
                      key={candidate.change.id}
                      value={candidate.change.id}
                      disabled={candidate.schedule === null}
                    >
                      {formatGrowthPreviewDate(candidate.change.happenedAt)} —{" "}
                      {GROWTH_CHANGE_LABELS[candidate.change.changeType]} —{" "}
                      {candidate.change.description
                        .replace(/\s+/g, " ")
                        .slice(0, 100)}
                      {candidate.unavailableReason === "future_change"
                        ? " — future change"
                        : ""}
                    </option>
                  ))}
                </select>
                {error ? (
                  <p id={`${id}-error`} role="alert" className="mt-1">
                    {error}
                  </p>
                ) : null}
                {selected ? (
                  <>
                    <GrowthChangeHistory
                      changes={[selected.change]}
                      limit={1}
                      headingLevel={4}
                      title="Selected measurement anchor"
                      caption="Review the saved date, page and note. This record anchors the timeline; it does not establish cause."
                    />
                    {selected.schedule ? (
                      <GrowthWorkMeasurementScheduleDetails
                        schedule={selected.schedule}
                        targetCount={targetCount}
                        metrics={metrics}
                      />
                    ) : (
                      <p role="alert" className="mt-3">
                        A future change cannot start measurement.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            );
          }}
        </form.Field>
        <p className="text-xs text-base-content/70">
          Starting freezes this change, schedule and metric set, and changes the
          Work status from Done to Measuring. It does not collect Google data or
          calculate a result yet.
        </p>
        <button type="submit" className="btn btn-primary">
          {pending ? "Starting measurement…" : "Start measurement"}
        </button>
      </fieldset>
    </form>
  );
}

export function GrowthWorkMeasurementScheduleDetails({
  schedule,
  targetCount,
  metrics,
  dueDate,
}: {
  schedule: GrowthWorkMeasurementSchedule;
  targetCount: number;
  metrics?: GrowthWorkMeasurementMetric[];
  dueDate?: string;
}) {
  return (
    <div className="mt-5 border-t border-base-300 pt-4">
      <h4 className="font-semibold">Measurement schedule</h4>
      <p className="mt-1 text-xs text-base-content/70">
        Inclusive calendar dates calculated from the saved project defaults. The
        recorded change uses UTC. Report timezone: {schedule.reportTimezone}.
      </p>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <ScheduleItem
          label="Baseline"
          value={dateRange(schedule.baselineStart, schedule.baselineEnd)}
        />
        <ScheduleItem
          label="Recorded change (UTC)"
          value={formatGrowthPreviewDate(schedule.anchorDate)}
        />
        <ScheduleItem
          label="Cooldown ends"
          value={formatGrowthPreviewDate(schedule.cooldownEnd)}
        />
        <ScheduleItem
          label="Primary window"
          value={dateRange(schedule.measurementStart, schedule.measurementEnd)}
        />
        <ScheduleItem
          label="Long-term window ends"
          value={
            schedule.longMeasurementEnd
              ? formatGrowthPreviewDate(schedule.longMeasurementEnd)
              : "Not configured"
          }
        />
        {dueDate ? (
          <ScheduleItem
            label="Review due"
            value={formatGrowthPreviewDate(dueDate)}
          />
        ) : null}
      </dl>
      <h5 className="mt-4 font-medium">Metrics</h5>
      {metrics ? (
        <ul className="mt-2 space-y-1 text-sm text-base-content/70">
          {metrics.map((metric, index) => (
            <li
              key={`${metric.metricType}:${index}:${metric.displayTarget}`}
              className="break-all"
            >
              {GROWTH_MEASUREMENT_METRIC_LABELS[metric.metricType]}
              {metric.isPrimary ? " (primary)" : " (context)"} —{" "}
              {metric.displayTarget ?? "Target withheld"}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-base-content/70">
          Search clicks (primary) and search impressions (context) for{" "}
          {targetCount} Work {targetCount === 1 ? "page" : "pages"}.
        </p>
      )}
    </div>
  );
}

function ScheduleItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-base-content/70">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function dateRange(start: string, end: string) {
  return `${formatGrowthPreviewDate(start)} – ${formatGrowthPreviewDate(end)}`;
}
