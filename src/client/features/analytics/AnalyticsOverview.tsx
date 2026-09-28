import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatTile, percentDelta } from "@/client/components/StatTile";
import {
  chartAxisTick,
  chartGridProps,
  chartTooltipStyle,
} from "@/client/lib/chartTheme";
interface AnalyticsSummary {
  visitors: number;
  sessions: number;
  outcomes: number;
  customers: number;
  attribution: {
    exact: number;
    ip_time: number;
    unattributed: number;
    manual?: number;
  };
  daily: { date: string; visitors: number; outcomes: number }[];
  sources: { label: string; visitors: number; outcomes: number }[];
  pages: { path: string; visitors: number; outcomes: number }[];
  coverage: string;
  outcomesAvailable?: boolean;
  primaryOutcome?: string;
  revenue?: { currency: string; receipts: number; refunds: number }[];
  comparison?: {
    window: { from: string; to: string };
    visitors: Metric;
    outcomes: Metric;
    customers: Metric;
  } | null;
}
type Metric = { current: number; previous: number };
export function AttributionLabel({ method }: { method: string }) {
  return (
    <span className="inline-flex rounded border border-base-300 px-2 py-0.5 text-xs font-medium">
      {method === "ip_time"
        ? "Inferred · network + time"
        : method === "exact"
          ? "Linked exactly"
          : method === "manual"
            ? "Manual decision"
            : "Not attributed"}
    </span>
  );
}
export function AnalyticsOverview({
  data,
  onPage,
  onSource,
}: {
  data: AnalyticsSummary;
  onPage: (page: string) => void;
  onSource: (source: string) => void;
}) {
  const [metric, setMetric] = useState<"visitors" | "outcomes">("visitors");
  const comparison = data.comparison;
  const deltaTitle = comparison
    ? `vs ${comparison.window.from.slice(0, 10)} to ${comparison.window.to.slice(0, 10)}`
    : undefined;
  const outcomesShown = data.outcomesAvailable !== false;
  const buckets = bucketDaily(data.daily);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Visitors"
          value={data.visitors.toLocaleString()}
          delta={change(comparison?.visitors)}
          deltaTitle={deltaTitle}
          hint={newSinceZero(comparison?.visitors)}
        />
        {outcomesShown ? (
          <>
            <StatTile
              label={humanizeEvent(data.primaryOutcome ?? "outcomes")}
              value={data.outcomes.toLocaleString()}
              delta={change(comparison?.outcomes)}
              deltaTitle={deltaTitle}
              hint={
                newSinceZero(comparison?.outcomes) ??
                conversionHint(data.outcomes, data.visitors)
              }
            />
            <StatTile
              label="New customers"
              value={data.customers.toLocaleString()}
              delta={change(comparison?.customers)}
              deltaTitle={deltaTitle}
              hint={newSinceZero(comparison?.customers)}
            />
          </>
        ) : null}
        {data.revenue?.length ? (
          <StatTile
            label="Net receipts"
            value={data.revenue.map(formatNet).join(" · ")}
            hint="Payments less refunds"
          />
        ) : null}
      </div>
      {!outcomesShown && (
        <p className="text-sm text-base-content/70">
          Sign-ups and customers appear once your backend sends verified events.
          Until then this report shows visits only.
        </p>
      )}

      <section
        aria-labelledby="analytics-trend"
        className="rounded-lg border border-base-300 p-4"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="analytics-trend" className="font-semibold">
            {metric === "visitors" ? "Visitors" : "Outcomes"} by{" "}
            {buckets.weekly ? "week" : "day"}
          </h2>
          {outcomesShown ? (
            <div role="group" aria-label="Chart metric" className="join">
              {(["visitors", "outcomes"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={metric === value}
                  className={`btn btn-xs join-item ${metric === value ? "btn-neutral" : "btn-ghost border-base-300"}`}
                  onClick={() => setMetric(value)}
                >
                  {value === "visitors" ? "Visitors" : "Outcomes"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div
          className="h-56 w-full"
          role="img"
          aria-label={`${metric} by ${buckets.weekly ? "week" : "day"}; values in the table below`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={buckets.rows}
              margin={{ top: 6, right: 8, bottom: 0, left: -20 }}
            >
              <defs>
                <linearGradient id="analyticsTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-primary)"
                    stopOpacity="var(--trend-fill-start-opacity)"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-primary)"
                    stopOpacity="var(--trend-fill-end-opacity)"
                  />
                </linearGradient>
              </defs>
              <CartesianGrid {...chartGridProps} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDay}
                tick={chartAxisTick}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
              />
              <YAxis
                allowDecimals={false}
                tick={chartAxisTick}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelFormatter={(label) =>
                  buckets.weekly
                    ? `Week of ${formatDay(String(label))}`
                    : formatDay(String(label))
                }
              />
              <Area
                type="monotone"
                dataKey={metric}
                name={metric === "visitors" ? "Visitors" : "Outcomes"}
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#analyticsTrend)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <details className="mt-2 text-xs text-base-content/70">
          <summary className="cursor-pointer">Show the numbers</summary>
          <table className="table table-xs mt-2">
            <thead>
              <tr>
                <th>{buckets.weekly ? "Week of" : "Date"}</th>
                <th className="text-right">Visitors</th>
                <th className="text-right">Outcomes</th>
              </tr>
            </thead>
            <tbody>
              {buckets.rows.map((d) => (
                <tr key={d.date}>
                  <td>{formatDay(d.date)}</td>
                  <td className="text-right tabular-nums">{d.visitors}</td>
                  <td className="text-right tabular-nums">{d.outcomes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankedTable
          title="Top sources"
          keyLabel="Source"
          rows={data.sources.map((s) => ({ ...s, key: s.label }))}
          onSelect={onSource}
          showOutcomes={outcomesShown}
        />
        <RankedTable
          title="Top landing pages"
          keyLabel="Page"
          rows={data.pages.map((p) => ({ ...p, label: p.path, key: p.path }))}
          onSelect={onPage}
          showOutcomes={outcomesShown}
        />
      </div>

      <details className="rounded-lg border border-base-300 px-4 py-3">
        <summary className="cursor-pointer font-medium">
          How customers were matched to visits
        </summary>
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
          {Object.entries(data.attribution).map(([method, count]) => (
            <div key={method} className="flex items-center gap-3">
              <AttributionLabel method={method} />
              <span className="font-semibold tabular-nums">{count}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 max-w-3xl text-sm text-base-content/70">
          {data.coverage}
        </p>
        <p className="mt-2 max-w-3xl text-xs text-base-content/60">
          Visitors are browsers that allowed tracking, not a count of people.
          Visitors and outcomes in the same period are activity totals, not a
          conversion rate for a group of people.
        </p>
      </details>
    </div>
  );
}

// Below this, a percentage change says more about the small base than the
// metric (3 -> 800 reads as "+26,567%"), so the tile states the base instead.
const MIN_COMPARABLE = 10;

function change(m: Metric | undefined) {
  return m && m.previous >= MIN_COMPARABLE
    ? percentDelta(m.current, m.previous)
    : null;
}

function newSinceZero(m: Metric | undefined) {
  if (!m || m.previous >= MIN_COMPARABLE) return null;
  return m.previous === 0
    ? "None in the previous period"
    : `Only ${m.previous} in the previous period`;
}

/** A short, stable name for an anonymous visitor, the same on every view. */
export function visitorLabel(contextId: string) {
  return `Visitor ${contextId.slice(0, 6).toUpperCase()}`;
}

/** "registration_completed" -> "Registration completed". */
export function humanizeEvent(name: string) {
  const text = name.replaceAll("_", " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Small rates keep a decimal: 0.4% is not 0%.
function formatRate(rate: number) {
  const percent = rate * 100;
  return `${percent < 10 && percent > 0 ? percent.toFixed(1) : percent.toFixed(0)}%`;
}

function conversionHint(outcomes: number, visitors: number) {
  if (visitors === 0) return null;
  return `${formatRate(outcomes / visitors)} of visitors`;
}

function formatNet(r: { currency: string; receipts: number; refunds: number }) {
  const format = new Intl.NumberFormat("en", {
    style: "currency",
    currency: r.currency,
  });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format((r.receipts - r.refunds) / 10 ** digits);
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
function formatDay(date: string) {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : dayFormat.format(parsed);
}

// Long ranges read better by week: sparse daily outcomes draw as a flat line
// with single-day spikes.
const WEEKLY_AFTER_DAYS = 45;
function bucketDaily(daily: AnalyticsSummary["daily"]) {
  if (daily.length <= WEEKLY_AFTER_DAYS) return { weekly: false, rows: daily };
  const rows: AnalyticsSummary["daily"] = [];
  for (let index = 0; index < daily.length; index += 7) {
    const week = daily.slice(index, index + 7);
    rows.push({
      date: week[0].date,
      visitors: week.reduce((sum, day) => sum + day.visitors, 0),
      outcomes: week.reduce((sum, day) => sum + day.outcomes, 0),
    });
  }
  return { weekly: true, rows };
}

function RankedTable({
  title,
  keyLabel,
  rows,
  onSelect,
  showOutcomes,
}: {
  title: string;
  keyLabel: string;
  rows: { key: string; label: string; visitors: number; outcomes: number }[];
  onSelect: (key: string) => void;
  showOutcomes: boolean;
}) {
  const max = Math.max(...rows.map((row) => row.visitors), 1);
  return (
    <section className="rounded-lg border border-base-300 p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>{keyLabel}</th>
              <th className="text-right">Visitors</th>
              {showOutcomes ? (
                <>
                  <th className="text-right">Outcomes</th>
                  <th className="text-right">Rate</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.key}>
                  <td className="w-full">
                    <button
                      type="button"
                      className="max-w-64 truncate text-left text-primary hover:underline"
                      onClick={() => onSelect(row.key)}
                      title={`Show journeys from ${row.label || "direct or unknown"}`}
                    >
                      {row.label || "Direct / unknown"}
                    </button>
                    <div
                      aria-hidden="true"
                      className="mt-1 h-1 rounded-full bg-primary/30"
                      style={{ width: `${(row.visitors / max) * 100}%` }}
                    />
                  </td>
                  <td className="text-right tabular-nums">{row.visitors}</td>
                  {showOutcomes ? (
                    <>
                      <td className="text-right tabular-nums">
                        {row.outcomes}
                      </td>
                      <td className="text-right tabular-nums text-base-content/70">
                        {row.visitors
                          ? formatRate(row.outcomes / row.visitors)
                          : "—"}
                      </td>
                    </>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-6 text-base-content/60">
                  No activity in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
