import {
  calendarDateInTimezone,
  earliestUtcCalendarDateBoundary,
} from "./GrowthMeasurementFacts";

function assertReportDay(reportDay: number) {
  if (!Number.isInteger(reportDay) || reportDay < 1 || reportDay > 7)
    throw new Error("Growth weekly report day is invalid");
}

function shiftCalendarDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    throw new Error("Growth weekly calendar date is invalid");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoWeekday(value: string) {
  const weekday = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** Initialises the cursor to this local week's configured ISO weekday. */
export function initialGrowthWeeklyReviewAt(
  now: Date,
  timezone: string,
  reportDay: number,
) {
  if (Number.isNaN(now.valueOf()))
    throw new Error("Growth weekly schedule clock is invalid");
  assertReportDay(reportDay);
  const localDate = calendarDateInTimezone(now.toISOString(), timezone);
  const scheduledDate = shiftCalendarDate(
    localDate,
    reportDay - isoWeekday(localDate),
  );
  return earliestUtcCalendarDateBoundary(scheduledDate, timezone);
}

/** Advances an observed weekly cursor until it is strictly in the future. */
export function advanceGrowthWeeklyReviewAt(
  observedAt: string,
  now: Date,
  timezone: string,
) {
  if (Number.isNaN(now.valueOf()))
    throw new Error("Growth weekly schedule clock is invalid");
  let scheduledDate = calendarDateInTimezone(observedAt, timezone);
  let next: string;
  do {
    scheduledDate = shiftCalendarDate(scheduledDate, 7);
    next = earliestUtcCalendarDateBoundary(scheduledDate, timezone);
  } while (next <= now.toISOString());
  return next;
}

export function growthWeeklyReviewCoordinate(
  scheduledAt: string,
  timezone: string,
) {
  const scheduledDate = calendarDateInTimezone(scheduledAt, timezone);
  const periodStart = shiftCalendarDate(scheduledDate, -7);
  const periodEnd = shiftCalendarDate(scheduledDate, -1);
  return {
    periodStart,
    periodEnd,
    cadenceSlot: `weekly-review:scheduled:${periodStart}:${periodEnd}`,
  };
}
