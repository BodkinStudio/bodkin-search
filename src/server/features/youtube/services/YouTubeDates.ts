import { YouTubeReportError } from "@/server/lib/youtubeErrors";
import type { YouTubeDateRange } from "@/shared/youtube";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
// The Analytics API documents non-audienceType reports from 2008-07-01 onward.
const EARLIEST_REPORT_DATE = "2008-07-01";

function validDate(value: string) {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function shiftYouTubeDate(value: string, days: number) {
  if (!validDate(value)) throw new RangeError("Invalid YouTube date.");
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function pacificYouTubeDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function inclusiveYouTubeDays(range: YouTubeDateRange) {
  return (
    Math.round(
      (new Date(`${range.endDate}T00:00:00.000Z`).valueOf() -
        new Date(`${range.startDate}T00:00:00.000Z`).valueOf()) /
        DAY_MS,
    ) + 1
  );
}

export function resolveYouTubeDateRange(
  input: Pick<
    { startDate?: string; endDate?: string },
    "startDate" | "endDate"
  >,
  now = new Date(),
) {
  if (Boolean(input.startDate) !== Boolean(input.endDate)) {
    throw new YouTubeReportError(
      "validation_error",
      "Provide both startDate and endDate, or neither.",
    );
  }
  const requestedDateRange =
    input.startDate && input.endDate
      ? { startDate: input.startDate, endDate: input.endDate }
      : null;
  if (
    requestedDateRange &&
    (!validDate(requestedDateRange.startDate) ||
      !validDate(requestedDateRange.endDate) ||
      requestedDateRange.startDate > requestedDateRange.endDate)
  ) {
    throw new YouTubeReportError(
      "validation_error",
      "Dates must be valid YYYY-MM-DD values with startDate on or before endDate.",
    );
  }
  const lastCompleteDay = shiftYouTubeDate(pacificYouTubeDate(now), -1);
  const resolvedDateRange = requestedDateRange ?? {
    startDate: shiftYouTubeDate(lastCompleteDay, -27),
    endDate: lastCompleteDay,
  };
  if (resolvedDateRange.endDate > lastCompleteDay) {
    throw new YouTubeReportError(
      "validation_error",
      "endDate cannot be after the last completed Pacific day.",
    );
  }
  if (inclusiveYouTubeDays(resolvedDateRange) > 90) {
    throw new YouTubeReportError(
      "validation_error",
      "Date ranges may contain at most 90 days.",
    );
  }
  const previousEnd = shiftYouTubeDate(resolvedDateRange.startDate, -1);
  const previousDateRange = {
    startDate: shiftYouTubeDate(
      previousEnd,
      -(inclusiveYouTubeDays(resolvedDateRange) - 1),
    ),
    endDate: previousEnd,
  };
  if (previousDateRange.startDate < EARLIEST_REPORT_DATE) {
    throw new YouTubeReportError(
      "validation_error",
      "The date range and its previous comparison may not start before 2008-07-01.",
    );
  }
  return { requestedDateRange, resolvedDateRange, previousDateRange };
}
