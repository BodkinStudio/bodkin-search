import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { useChartWidth } from "@/client/features/rank-tracking/RankTrackingTrendChart";
import {
  GROWTH_EVIDENCE_KIND_DESCRIPTIONS,
  GROWTH_EVIDENCE_KIND_LABELS,
  type GrowthActionEvidenceDto,
  type GrowthEvidenceSeriesDto,
} from "@/types/schemas/growth-plan";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import { formatDeltaLine, formatMonthLabel } from "./GrowthEvidenceChart";
import { GROWTH_EVIDENCE_KIND_BADGES } from "./GrowthPlanPresentation";

type SeriesPoint = GrowthEvidenceSeriesDto["points"][number];

const formatValue = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("en-GB");

// A round number at or above the largest value, so the top gridline reads as a
// scale rather than as a data point.
function niceMax(max: number) {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step =
    [1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= max) ?? 10;
  return step * magnitude;
}

// "Search Console · Jun 2025 – Aug 2026": the source up to its first comma, and
// the window the chart actually covers. The rest of the provenance (the exact
// observation date and the unit) is in the numbers table.
function chartCaption(
  evidence: GrowthActionEvidenceDto,
  series: GrowthEvidenceSeriesDto,
) {
  const source = evidence.sourceLabel.split(",")[0].trim();
  const monthly = series.kind === "monthly";
  const first = series.points[0];
  const last = series.points[series.points.length - 1];
  const window =
    monthly && series.points.length > 1
      ? `${formatMonthLabel(first.label)} – ${formatMonthLabel(last.label)}`
      : null;
  return [source, window].filter(Boolean).join(" · ");
}

// Monthly labels are YYYY-MM; anything else is a category name already written
// for a reader.
const pointLabel = (series: GrowthEvidenceSeriesDto, label: string) =>
  series.kind === "monthly" && /^\d{4}-\d{2}$/.test(label)
    ? formatMonthLabel(label)
    : label;

// The author's own numbers behind a statement. One chart per evidence item, so
// the chart and the claim it supports can never drift apart.
export function GrowthEvidenceSeriesChart({
  evidence,
  height = 128,
  showFinding = false,
  projectName,
}: {
  evidence: GrowthActionEvidenceDto;
  height?: number;
  // The statement the chart supports, called out beneath it. Off in the hero,
  // where the thesis already says what the chart means.
  showFinding?: boolean;
  // Marks the project's own column in a matrix.
  projectName?: string;
}) {
  const series = evidence.series;
  if (!series || series.points.length === 0) return null;

  return (
    <figure className="min-w-0">
      <figcaption>
        <h3 className="text-sm font-semibold">{series.title}</h3>
        <p className="mt-1 truncate text-[12.5px] text-base-content/60">
          <span
            className={`badge badge-sm mr-2 align-middle ${GROWTH_EVIDENCE_KIND_BADGES[evidence.kind]}`}
            title={GROWTH_EVIDENCE_KIND_DESCRIPTIONS[evidence.kind]}
          >
            {GROWTH_EVIDENCE_KIND_LABELS[evidence.kind]}
          </span>
          {chartCaption(evidence, series)}
        </p>
      </figcaption>
      {series.kind === "monthly" ? (
        <MonthlySeries series={series} height={height} />
      ) : null}
      {series.kind === "bars" ? <BarsSeries series={series} /> : null}
      {series.kind === "matrix" ? (
        <MatrixSeries series={series} projectName={projectName} />
      ) : null}
      {showFinding ? (
        <p className="mt-3 border-l-[3px] border-primary pl-3 text-[13.5px] text-base-content/70">
          {evidence.statement}
        </p>
      ) : null}
      <SeriesNumbers series={series} evidence={evidence} />
    </figure>
  );
}

function MonthlySeries({
  series,
  height,
}: {
  series: GrowthEvidenceSeriesDto;
  height: number;
}) {
  const { containerRef, width } = useChartWidth();
  const points = series.points;
  const hasNegative = points.some((point) => (point.value ?? 0) < 0);
  const top = niceMax(Math.max(...points.map((point) => point.value ?? 0), 0));
  const first = points[0];
  const last = points[points.length - 1];
  // First and last always, plus quarter starts in between, so a long run of
  // months keeps a readable axis.
  const ticks = points
    .filter(
      (point, index) =>
        index === 0 ||
        index === points.length - 1 ||
        ["01", "04", "07", "10"].includes(point.label.slice(5, 7)),
    )
    .map((point) => point.label);
  const delta =
    points.length > 1 && first.value !== null && last.value !== null
      ? formatDeltaLine(
          { label: pointLabel(series, first.label), value: first.value },
          { label: pointLabel(series, last.label), value: last.value },
        )
      : null;

  return (
    <>
      <div
        ref={containerRef}
        className="mt-3 w-full min-w-0"
        style={{ height }}
      >
        {width > 0 ? (
          <AreaChart
            width={width}
            height={height}
            data={points}
            margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
            role="img"
            aria-label={series.title}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              opacity={0.12}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              ticks={ticks}
              tickFormatter={(label: string) => pointLabel(series, label)}
              tick={{ fontSize: 10, fill: "#888" }}
              tickLine={false}
              axisLine={false}
              minTickGap={16}
            />
            <YAxis
              domain={[hasNegative ? "dataMin" : 0, top]}
              ticks={hasNegative ? undefined : [0, top / 2, top]}
              width={44}
              tickCount={3}
              tick={{ fontSize: 10, fill: "#888" }}
              tickFormatter={(value: number) => value.toLocaleString("en-GB")}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
              content={(props: TooltipContentProps<number, string>) => {
                const row = points.find((point) => point.label === props.label);
                if (!props.active || !row) return null;
                return (
                  <div className="rounded-md border border-base-300 bg-base-100 px-2 py-1 text-xs shadow">
                    <p className="font-medium">
                      {pointLabel(series, row.label)}
                    </p>
                    <p className="tabular-nums text-base-content/70">
                      {formatValue(row.value)} {series.unit}
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="var(--color-primary)"
              fillOpacity={0.12}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </AreaChart>
        ) : null}
      </div>
      {delta ? (
        <p className="mt-2 font-mono text-[12.5px] tabular-nums text-base-content/60">
          {delta}
        </p>
      ) : null}
    </>
  );
}

function BarsSeries({ series }: { series: GrowthEvidenceSeriesDto }) {
  // Scaled on magnitude so a negative value cannot produce a negative width;
  // the bar stops at zero and the signed number is printed beside it.
  const max = Math.max(
    ...series.points.map((point) => Math.abs(point.value ?? 0)),
    0,
  );
  return (
    <ul className="mt-3 space-y-1.5">
      {series.points.map((point) => (
        <li
          key={`${point.position}:${point.label}`}
          className="grid grid-cols-[minmax(220px,auto)_minmax(0,1fr)] items-center gap-3 text-[13px]"
          title={`${point.label}: ${formatValue(point.value)} ${series.unit}`}
        >
          <span className="text-base-content/70">{point.label}</span>
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-3 rounded-sm bg-primary"
              style={{
                width:
                  max > 0
                    ? `${(Math.max(point.value ?? 0, 0) / max) * 100}%`
                    : "0%",
              }}
            />
            <span className="shrink-0 tabular-nums text-base-content/70">
              {formatValue(point.value)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function MatrixSeries({
  series,
  projectName,
}: {
  series: GrowthEvidenceSeriesDto;
  projectName?: string;
}) {
  const rows = distinct(series.points.map((point) => point.label));
  const columns = distinct(
    series.points.flatMap((point) => (point.group ? [point.group] : [])),
  );
  // A position is better when it is lower, so the shading runs the other way.
  const lowerIsBetter = series.unit.toLowerCase().includes("position");
  const values = series.points
    .map((point) => point.value)
    .filter((value): value is number => value !== null);
  const min = Math.min(...values, Number.POSITIVE_INFINITY);
  const max = Math.max(...values, Number.NEGATIVE_INFINITY);

  const shade = (value: number | null) => {
    if (value === null || values.length === 0 || max === min)
      return value === null ? "" : "bg-primary/30";
    const share = (value - min) / (max - min);
    const strength = lowerIsBetter ? 1 - share : share;
    if (strength > 0.75) return "bg-primary text-primary-content";
    if (strength > 0.5) return "bg-primary/60";
    if (strength > 0.25) return "bg-primary/30";
    return "bg-primary/10";
  };

  return (
    <>
      <div className="mt-3 overflow-x-auto">
        <table className="table table-xs">
          <thead>
            <tr>
              <th />
              {columns.map((column) => (
                <th key={column} className="text-center text-[12px]">
                  {column}
                  {projectName &&
                  column.toLowerCase() === projectName.toLowerCase() ? (
                    <span className="ml-1 font-normal text-base-content/60">
                      (you)
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <td className="text-[12.5px] [overflow-wrap:anywhere]">
                  {row}
                </td>
                {columns.map((column) => {
                  const value =
                    series.points.find(
                      (point) => point.label === row && point.group === column,
                    )?.value ?? null;
                  return (
                    <td
                      key={column}
                      className={`text-center text-[12px] tabular-nums ${shade(value)}`}
                    >
                      {formatValue(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-base-content/60">
        Darker = {lowerIsBetter ? "better" : "higher"} {series.unit} · — = not
        in this sample
      </p>
    </>
  );
}

function SeriesNumbers({
  series,
  evidence,
}: {
  series: GrowthEvidenceSeriesDto;
  evidence: GrowthActionEvidenceDto;
}) {
  const hasGroups = series.points.some((point) => point.group);
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-base-content/60">
        Show the numbers
      </summary>
      <div className="mt-2 overflow-x-auto">
        <p className="mb-2 text-[12.5px] text-base-content/60">
          {evidence.sourceLabel}
          {evidence.observedOn
            ? `, observed ${formatGrowthPreviewDate(evidence.observedOn)}`
            : ""}
          {series.unit ? ` · ${series.unit}` : ""}
        </p>
        <table className="table table-xs">
          <thead>
            <tr>
              <th>Label</th>
              {hasGroups ? <th>Group</th> : null}
              <th className="text-right">{series.unit}</th>
            </tr>
          </thead>
          <tbody>
            {series.points.map((point: SeriesPoint) => (
              <tr key={`${point.position}:${point.label}:${point.group ?? ""}`}>
                <td>{pointLabel(series, point.label)}</td>
                {hasGroups ? <td>{point.group ?? "—"}</td> : null}
                <td className="text-right tabular-nums">
                  {formatValue(point.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function distinct(values: string[]) {
  return [...new Set(values)];
}
