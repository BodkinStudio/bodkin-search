import { calendarDateInTimezone } from "./GrowthMeasurementFacts";

/** Previous complete calendar month in the selected report timezone. */
export function previousCompleteGrowthMonthlyPeriod(
  cutoff: string,
  timezone: string,
) {
  const current = calendarDateInTimezone(cutoff, timezone);
  const monthStart = new Date(`${current.slice(0, 7)}-01T00:00:00.000Z`);
  monthStart.setUTCMonth(monthStart.getUTCMonth() - 1);
  const periodStart = monthStart.toISOString().slice(0, 10);
  monthStart.setUTCMonth(monthStart.getUTCMonth() + 1);
  monthStart.setUTCDate(0);
  return {
    periodStart,
    periodEnd: monthStart.toISOString().slice(0, 10),
  };
}
