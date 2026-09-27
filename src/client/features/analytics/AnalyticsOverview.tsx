import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
}
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
  const [metric, setMetric] = useState<"visitors" | "outcomes">("outcomes");
  return (
    <div className="space-y-9">
      <div className="grid grid-cols-2 gap-5 border-b border-base-300 pb-6 md:grid-cols-4">
        {[
          { label: "Tracked visitors", value: data.visitors },
          ...(data.outcomesAvailable !== false
            ? [
                {
                  label: (
                    data.primaryOutcome ?? "Verified outcomes"
                  ).replaceAll("_", " "),
                  value: data.outcomes,
                },
                { label: "New customers", value: data.customers },
              ]
            : []),
        ].map((m) => (
          <div key={m.label}>
            <p className="text-xs font-medium text-base-content/70">
              {m.label}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {m.value.toLocaleString()}
            </p>
          </div>
        ))}
        {!!data.revenue?.length && (
          <div>
            <p className="text-xs font-medium text-base-content/70">
              Net receipts
            </p>
            {data.revenue.map((r) => (
              <p
                key={r.currency}
                className="mt-2 text-2xl font-semibold tabular-nums"
              >
                {new Intl.NumberFormat("en", {
                  style: "currency",
                  currency: r.currency,
                }).format(
                  (r.receipts - r.refunds) /
                    10 **
                      (new Intl.NumberFormat("en", {
                        style: "currency",
                        currency: r.currency,
                      }).resolvedOptions().maximumFractionDigits ?? 2),
                )}
              </p>
            ))}
            <p className="mt-1 text-xs text-base-content/60">
              Payments less refunds · currencies kept separate
            </p>
          </div>
        )}
      </div>
      {data.outcomesAvailable === false && (
        <p className="text-sm text-base-content/70">
          No verified integration events received. Outcomes and customer totals
          will appear after the backend integration is connected.
        </p>
      )}
      <section aria-labelledby="analytics-trend">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id="analytics-trend" className="font-semibold">
            Activity over time
          </h2>
          <label className="flex items-center gap-2 text-xs">
            Chart
            <select
              className="select select-sm"
              value={metric}
              onChange={(e) =>
                setMetric(
                  e.target.value === "visitors" ? "visitors" : "outcomes",
                )
              }
            >
              <option value="outcomes">Verified outcomes</option>
              <option value="visitors">Tracked visitors</option>
            </select>
          </label>
        </div>
        <div
          className="h-56 w-full"
          role="img"
          aria-label={`${metric} by day; table follows`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data.daily}
              margin={{ top: 10, right: 10, bottom: 0, left: -25 }}
            >
              <CartesianGrid vertical={false} stroke="var(--color-base-300)" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => String(v).slice(5)}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                minTickGap={30}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-base-100)",
                  borderColor: "var(--color-base-300)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line
                dataKey={metric}
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <details className="mt-2 text-xs text-base-content/70">
          <summary className="cursor-pointer">View daily values</summary>
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Date (UTC)</th>
                <th>Visitors</th>
                <th>Outcomes</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.visitors}</td>
                  <td>{d.outcomes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>
      <div className="grid gap-8 lg:grid-cols-2">
        <RankedTable
          title="Where journeys begin"
          rows={data.sources.map((s) => ({ ...s, key: s.label }))}
          onSelect={onSource}
        />
        <RankedTable
          title="Landing pages"
          rows={data.pages.map((p) => ({ ...p, label: p.path, key: p.path }))}
          onSelect={onPage}
        />
      </div>
      <section className="border-t border-base-300 pt-6">
        <h2 className="font-semibold">How the connection was made</h2>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          {Object.entries(data.attribution).map(([method, count]) => (
            <div key={method} className="flex items-center gap-3">
              <AttributionLabel method={method} />
              <span className="font-semibold tabular-nums">{count}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-3xl text-sm text-base-content/70">
          {data.coverage}
        </p>
        <p className="mt-2 text-xs text-base-content/60">
          Tracked visitors are permitted browser contexts, not a census of
          people. Activity totals are not a cohort conversion rate.
        </p>
      </section>
    </div>
  );
}
function RankedTable({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows: { key: string; label: string; visitors: number; outcomes: number }[];
  onSelect: (key: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Source / page</th>
              <th className="text-right">Visitors</th>
              <th className="text-right">Outcomes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <button
                      className="max-w-64 truncate text-left text-primary hover:underline"
                      onClick={() => onSelect(row.key)}
                    >
                      {row.label || "Direct / unknown"}
                    </button>
                  </td>
                  <td className="text-right tabular-nums">{row.visitors}</td>
                  <td className="text-right tabular-nums">{row.outcomes}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="py-6 text-base-content/60">
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
