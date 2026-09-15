import type { GrowthReportSectionType } from "@/types/schemas/growth-reports";

export const GROWTH_REPORT_SECTION_TITLES: Record<
  GrowthReportSectionType,
  string
> = {
  executive_summary: "Executive summary",
  performance: "Performance",
  meaningful_changes: "Meaningful changes",
  work_completed: "Work completed",
  results_from_earlier_work: "Results from earlier work",
  risks: "Risks",
  opportunities: "Opportunities",
  next_month: "Next month",
};

function utcDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function formatGrowthReportMonth(periodStart: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDate(periodStart));
}

export function formatGrowthReportDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDate(value));
}

export function formatGrowthReportTimestamp(value: string) {
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

export function formatGrowthReportFact(
  value: string | number | boolean | null,
) {
  if (value === null) return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString("en-GB");
  return value;
}
