// Recharts styling shared by every trend chart, read from the --trend-* tokens
// in app.css so charts follow the light and dark themes.
export const chartAxisTick = {
  fill: "var(--trend-axis-color)",
  fontSize: 11,
} as const;

export const chartGridProps = {
  stroke: "var(--trend-grid-color)",
  strokeDasharray: "2 4",
} as const;

export const chartTooltipStyle = {
  backgroundColor: "var(--trend-tooltip-bg)",
  border: "1px solid var(--trend-tooltip-border)",
  borderRadius: "10px",
  boxShadow: "0 8px 24px var(--trend-tooltip-shadow)",
  color: "var(--color-base-content)",
} as const;
