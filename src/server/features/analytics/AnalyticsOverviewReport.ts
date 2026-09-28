import { AnalyticsQueries } from "./AnalyticsQueries";
import type { AnalyticsQuery } from "@/types/schemas/analytics";
import {
  calendarDay,
  calendarMidnight,
  shiftDay,
} from "@/shared/analytics/calendar";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
export async function overviewReport(q: AnalyticsQuery) {
  const data = await AnalyticsQueries.overview(q);
  if (!q.compare) return { ...data, comparison: null };
  const w = repo.windowFor(q);
  const timezone = q.timezone ?? "UTC";
  const first = calendarDay(w.from, timezone);
  const last = calendarDay(w.to, timezone);
  const days =
    Math.round((Date.parse(last) - Date.parse(first)) / 86400_000) + 1;
  const previous = {
    ...q,
    from: calendarMidnight(shiftDay(first, -days), timezone),
    to: new Date(
      Date.parse(calendarMidnight(first, timezone)) - 1,
    ).toISOString(),
    compare: false,
  };
  const baseline = await AnalyticsQueries.overview(previous);
  return {
    ...data,
    comparison: {
      window: repo.windowFor(previous),
      visitors: { current: data.visitors, previous: baseline.visitors },
      outcomes: { current: data.outcomes, previous: baseline.outcomes },
      customers: { current: data.customers, previous: baseline.customers },
    },
  };
}
