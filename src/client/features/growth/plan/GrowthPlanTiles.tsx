import { Area, AreaChart } from "recharts";
import { useChartWidth } from "@/client/features/rank-tracking/RankTrackingTrendChart";
import type {
  GrowthActionEvidenceDto,
  GrowthPlanActionDto,
} from "@/types/schemas/growth-plan";
import { formatDeltaLine, formatMonthLabel } from "./GrowthEvidenceChart";
import {
  GROWTH_PLAN_IN_PROGRESS_STATUSES,
  GROWTH_PLAN_READY_STATUSES,
  GROWTH_PLAN_SHIPPED_STATUSES,
} from "./GrowthPlanPresentation";
import type { GrowthPlanSeriesEntry } from "./growthPlanSeries";

const TILE =
  "flex flex-col gap-2 rounded-lg border border-base-300 bg-base-100 px-[18px] py-4";
const LABEL = "text-[12.5px] text-base-content/60";
const VALUE = "text-[30px] leading-none font-bold tabular-nums";

// Where the plan stands, in three numbers: one trend the author supplied, how
// much evidence the plan rests on, and how much of the work has moved.
export function GrowthPlanTiles({
  actions,
  evidence,
  sparkline,
}: {
  actions: GrowthPlanActionDto[];
  evidence: GrowthActionEvidenceDto[];
  sparkline: GrowthPlanSeriesEntry | null;
}) {
  if (actions.length === 0 && evidence.length === 0) return null;
  const count = (statuses: readonly string[]) =>
    actions.filter((action) => statuses.includes(action.status)).length;
  const shipped = count(GROWTH_PLAN_SHIPPED_STATUSES);
  const inProgress = count(GROWTH_PLAN_IN_PROGRESS_STATUSES);
  const ready = count(GROWTH_PLAN_READY_STATUSES);
  const kind = (name: string) =>
    evidence.filter((item) => item.kind === name).length;

  return (
    <div
      className={`grid gap-3 ${sparkline ? "md:grid-cols-3" : "md:grid-cols-2"}`}
    >
      {sparkline ? <SparklineTile entry={sparkline} /> : null}
      <div className={TILE}>
        <p className={LABEL}>Evidence behind this plan</p>
        <p className={VALUE}>
          {evidence.length}
          <span className="ml-2 text-[14px] font-medium text-base-content/60">
            {evidence.length === 1 ? "item" : "items"}
          </span>
        </p>
        <p className="text-[12.5px] text-base-content/70">
          {kind("measured")} measured · {kind("sampled")} sampled ·{" "}
          {kind("estimate")} estimate
        </p>
      </div>
      <div className={TILE}>
        <p className={LABEL}>Work in the plan</p>
        <p className={VALUE}>
          {actions.length}
          <span className="ml-2 text-[14px] font-medium text-base-content/60">
            {actions.length === 1 ? "action" : "actions"}
          </span>
        </p>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          <Segment
            count={shipped}
            total={actions.length}
            className="bg-success"
          />
          <Segment
            count={inProgress}
            total={actions.length}
            className="bg-primary"
          />
          <Segment
            count={ready}
            total={actions.length}
            className="bg-base-300"
          />
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-base-content/70">
          <Legend className="bg-success" label={`${shipped} shipped`} />
          <Legend className="bg-primary" label={`${inProgress} in progress`} />
          <Legend className="bg-base-300" label={`${ready} ready`} />
        </ul>
      </div>
    </div>
  );
}

function Segment({
  count,
  total,
  className,
}: {
  count: number;
  total: number;
  className: string;
}) {
  if (count === 0 || total === 0) return null;
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ width: `${(count / total) * 100}%` }}
    />
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-2.5 rounded-sm ${className}`} />
      {label}
    </li>
  );
}

function SparklineTile({ entry }: { entry: GrowthPlanSeriesEntry }) {
  const { containerRef, width } = useChartWidth();
  const points = entry.series.points.filter((point) => point.value !== null);
  const last = points[points.length - 1];
  const first = points[0];
  const delta =
    points.length > 1 && first.value !== null && last.value !== null
      ? formatDeltaLine(
          { label: formatMonthLabel(first.label), value: first.value },
          { label: formatMonthLabel(last.label), value: last.value },
        )
      : null;

  return (
    <div className={TILE}>
      <p className={LABEL}>{entry.series.title}</p>
      <p className={VALUE}>
        {last?.value?.toLocaleString("en-GB") ?? "—"}
        <span className="ml-2 text-[14px] font-medium text-base-content/60">
          {last ? formatMonthLabel(last.label) : entry.series.unit}
        </span>
      </p>
      <div ref={containerRef} className="h-11 w-full min-w-0">
        {width > 0 && points.length > 1 ? (
          <AreaChart
            width={width}
            height={44}
            data={points}
            margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
            role="img"
            aria-label={entry.series.title}
          >
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-primary)"
              strokeWidth={1.5}
              fill="var(--color-primary)"
              fillOpacity={0.12}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        ) : null}
      </div>
      {delta ? (
        <p className="text-[12.5px] tabular-nums text-base-content/60">
          {delta}
        </p>
      ) : null}
    </div>
  );
}
