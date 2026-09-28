import {
  calendarDateInTimezone,
  earliestUtcCalendarDateBoundary,
} from "./GrowthMeasurementFacts";
import { previousCompleteGrowthMonthlyPeriod } from "./GrowthMonthlyReportPeriod";

function scheduledDate(month: string, reportDay: number) {
  if (!Number.isInteger(reportDay) || reportDay < 1 || reportDay > 28)
    throw new Error("Growth monthly report day is invalid");
  return `${month}-${String(reportDay).padStart(2, "0")}`;
}

function shiftMonth(month: string, count: number) {
  const value = new Date(`${month}-01T00:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + count);
  return value.toISOString().slice(0, 7);
}

/**
 * Initialises a monthly cursor to this month's configured local report day.
 * When that instant has already passed the cursor remains overdue so enabling
 * Growth does not silently skip the previous complete month.
 */
export function initialGrowthMonthlyReviewAt(
  now: Date,
  timezone: string,
  reportDay: number,
) {
  if (Number.isNaN(now.valueOf()))
    throw new Error("Growth monthly schedule clock is invalid");
  const localMonth = calendarDateInTimezone(now.toISOString(), timezone).slice(
    0,
    7,
  );
  return earliestUtcCalendarDateBoundary(
    scheduledDate(localMonth, reportDay),
    timezone,
  );
}

/** Advances an observed monthly cursor until it is strictly in the future. */
export function advanceGrowthMonthlyReviewAt(
  observedAt: string,
  now: Date,
  timezone: string,
  reportDay: number,
) {
  if (Number.isNaN(now.valueOf()))
    throw new Error("Growth monthly schedule clock is invalid");
  let month = calendarDateInTimezone(observedAt, timezone).slice(0, 7);
  let next: string;
  do {
    month = shiftMonth(month, 1);
    next = earliestUtcCalendarDateBoundary(
      scheduledDate(month, reportDay),
      timezone,
    );
  } while (next <= now.toISOString());
  return next;
}

export function growthMonthlyReviewCoordinate(
  scheduledAt: string,
  timezone: string,
) {
  const period = previousCompleteGrowthMonthlyPeriod(scheduledAt, timezone);
  return {
    ...period,
    cadenceSlot: `monthly-review:scheduled:${period.periodStart}:${period.periodEnd}`,
  };
}
