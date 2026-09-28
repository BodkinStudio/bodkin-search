import type { ReactNode } from "react";

export type StatDelta = { text: string; improved: boolean } | null;

// A headline number with its change against the comparison period.
export function StatTile({
  label,
  value,
  delta,
  deltaTitle,
  hint,
}: {
  label: string;
  value: ReactNode;
  delta?: StatDelta;
  deltaTitle?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="text-xs uppercase tracking-wide text-base-content/60">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {delta ? (
          <span
            className={`text-xs ${delta.improved ? "text-success" : "text-error"}`}
            title={deltaTitle}
          >
            {delta.text}
            {deltaTitle ? <span className="sr-only"> {deltaTitle}</span> : null}
          </span>
        ) : null}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-base-content/60">{hint}</div>
      ) : null}
    </div>
  );
}

/** Percentage change, or null when there is no baseline to compare with. */
export function percentDelta(current: number, previous: number): StatDelta {
  if (previous <= 0) return null;
  const change = (current - previous) / previous;
  const pct = (change * 100).toFixed(1);
  return { text: `${change >= 0 ? "+" : ""}${pct}%`, improved: change >= 0 };
}
