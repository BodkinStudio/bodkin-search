import { Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import { useChartWidth } from "@/client/features/rank-tracking/RankTrackingTrendChart";
import type {
  GrowthEvidenceMonth,
  GrowthPlanEvidenceSeriesDto,
} from "@/types/schemas/growth-plan";

type PagesState = GrowthPlanEvidenceSeriesDto["pages"]["state"];
type GrowthEvidenceNoticeState = Exclude<PagesState, "available"> | "error";

const STATE_MESSAGES: Record<
  Exclude<GrowthEvidenceNoticeState, "capped">,
  string
> = {
  no_targets:
    "Add URL targets to actions to chart their Search Console history.",
  not_connected: "Connect Search Console to see this.",
  unavailable: "Search Console did not respond; try again later.",
  no_data:
    "Search Console returned no rows for these pages in the window. Check the stored URL matches the form Search Console reports.",
  error: "Evidence could not be loaded.",
};

// "2026-08" -> "Aug 26". Months are complete calendar months, so the day is
// irrelevant and a two-digit year keeps the endpoint labels short.
export function formatMonthLabel(month: string) {
  return `${monthName(month)} ${month.slice(2, 4)}`;
}

// "2025-06-01" -> "Jun 2025", for the caption that dates the whole window.
function formatMonthYear(date: string) {
  return `${monthName(date.slice(0, 7))} ${date.slice(0, 4)}`;
}

function monthName(month: string) {
  const [year, index] = month.split("-");
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(index) - 1, 1)));
}

// The provenance line belongs to a series that was actually read: every other
// state explains itself in its own notice.
export function hasEvidenceProvenance(
  pages: GrowthPlanEvidenceSeriesDto["pages"],
) {
  return pages.state === "available" || pages.state === "no_data";
}

// Every chart says where its numbers came from: the window it covers, and how
// many of the plan's URL targets were actually read.
export function formatEvidenceCaption(
  pages: GrowthPlanEvidenceSeriesDto["pages"],
) {
  const parts = ["Measured · your Search Console"];
  if (pages.window)
    parts.push(
      `${formatMonthYear(pages.window.start)} – ${formatMonthYear(pages.window.end)}, complete months`,
    );
  else parts.push("complete months");
  if (pages.totalUrls > pages.urls.length)
    parts.push(`${pages.urls.length} of ${pages.totalUrls} pages`);
  return parts.join(" · ");
}

// "Aug 25 → Aug 26: 15,105 → 4,854 (−68%)". A percentage is only printed when
// it is both meaningful and not a rounding artefact.
export function formatDeltaLine(
  from: { label: string; value: number },
  to: { label: string; value: number },
) {
  const change =
    from.value === 0
      ? null
      : Math.round(((to.value - from.value) / from.value) * 100);
  const move =
    to.value === from.value
      ? "no change"
      : change === null || change === 0
        ? null
        : `${change > 0 ? "+" : "−"}${Math.abs(change)}%`;
  return `${from.label} → ${to.label}: ${from.value.toLocaleString("en-GB")} → ${to.value.toLocaleString("en-GB")}${
    move === null ? "" : ` (${move})`
  }`;
}

export function formatMonthDelta(
  months: GrowthEvidenceMonth[],
  metric: "clicks" | "impressions",
) {
  if (months.length < 2) return null;
  const first = months[0];
  const last = months[months.length - 1];
  return formatDeltaLine(
    { label: formatMonthLabel(first.month), value: first[metric] },
    { label: formatMonthLabel(last.month), value: last[metric] },
  );
}

export function GrowthEvidenceNotice({
  state,
  totalUrls = 0,
}: {
  state: GrowthEvidenceNoticeState;
  // Only read for the capped state, which names how many targets went unread.
  totalUrls?: number;
}) {
  return (
    <p className="mt-3 text-sm text-base-content/60">
      {state === "capped"
        ? `Not read: the plan has more than 10 page targets, and these ${totalUrls} were beyond the cap.`
        : STATE_MESSAGES[state]}
    </p>
  );
}

export function GrowthEvidenceChartSkeleton({
  height = 140,
}: {
  height?: number;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading Search Console history"
      className="mt-3 w-full animate-pulse rounded-md bg-base-200"
      style={{ height }}
    />
  );
}

// One metric per chart, no legend: the plan reads the shape, and the exact
// numbers are in the tooltip and the delta line beneath it.
export function GrowthEvidenceMonthlyChart({
  months,
  metric,
  height = 140,
  label,
}: {
  months: GrowthEvidenceMonth[];
  metric: "clicks" | "impressions";
  height?: number;
  label: string;
}) {
  const { containerRef, width } = useChartWidth();
  const ticks =
    months.length > 1
      ? [months[0].month, months[months.length - 1].month]
      : months.map((month) => month.month);

  return (
    <div ref={containerRef} className="mt-3 w-full min-w-0" style={{ height }}>
      {width > 0 && months.length > 0 ? (
        <AreaChart
          width={width}
          height={height}
          data={months}
          margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
          role="img"
          aria-label={label}
        >
          <XAxis
            dataKey="month"
            ticks={ticks}
            tickFormatter={formatMonthLabel}
            tick={{ fontSize: 10, fill: "#888" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, "auto"]}
            width={40}
            tickCount={3}
            tick={{ fontSize: 10, fill: "#888" }}
            tickFormatter={(value: number) => value.toLocaleString("en-GB")}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
            content={(props: TooltipContentProps<number, string>) => {
              const row = months.find((month) => month.month === props.label);
              if (!props.active || !row) return null;
              return (
                <div className="rounded-md border border-base-300 bg-base-100 px-2 py-1 text-xs shadow">
                  <p className="font-medium">{formatMonthLabel(row.month)}</p>
                  <p className="tabular-nums text-base-content/70">
                    {row.clicks.toLocaleString("en-GB")} clicks
                  </p>
                  <p className="tabular-nums text-base-content/70">
                    {row.impressions.toLocaleString("en-GB")} impressions
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey={metric}
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="var(--color-primary)"
            fillOpacity={0.12}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      ) : null}
    </div>
  );
}

// "3 of 10 pages could not be read" — shown beside an available series so a
// partial read is never mistaken for the whole picture.
export function GrowthEvidenceFailures({
  pages,
}: {
  pages: GrowthPlanEvidenceSeriesDto["pages"];
}) {
  if (pages.failedUrls === 0) return null;
  return (
    <p className="mt-1 text-xs text-base-content/60">
      {pages.failedUrls} of {pages.urls.length} pages could not be read
    </p>
  );
}
