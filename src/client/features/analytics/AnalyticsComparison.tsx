type Metric = { current: number; previous: number };
export function AnalyticsComparison({
  comparison,
}: {
  comparison:
    | {
        window: { from: string; to: string };
        visitors: Metric;
        outcomes: Metric;
        customers: Metric;
      }
    | null
    | undefined;
}) {
  if (!comparison) return null;
  return (
    <section
      className="space-y-2 border-b border-base-300 pb-4"
      aria-label="Preceding period comparison"
    >
      <p className="text-xs text-base-content/60">
        Compared with {comparison.window.from.slice(0, 10)}–
        {comparison.window.to.slice(0, 10)} (UTC boundaries)
      </p>
      <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
        {(
          [
            ["Tracked visitors", comparison.visitors],
            ["Verified outcomes", comparison.outcomes],
            ["New customers", comparison.customers],
          ] as const
        ).map(([label, m]) => {
          const change = m.current - m.previous;
          return (
            <div key={label}>
              <dt className="text-base-content/60">{label}</dt>
              <dd>
                {m.current} vs {m.previous} · {change >= 0 ? "+" : ""}
                {change}
                {m.previous !== 0
                  ? ` (${((change / m.previous) * 100).toFixed(1)}%)`
                  : " (zero baseline)"}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
