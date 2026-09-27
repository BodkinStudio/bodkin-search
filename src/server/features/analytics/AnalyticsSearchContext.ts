import { and, eq, gte, lte, desc, inArray, countDistinct } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsEvents,
  growthMeasurementMetrics,
  growthMeasurementObservations,
} from "@/db/schema";
import type { AnalyticsQuery } from "@/types/schemas/analytics";
import { calendarMidnight, shiftDay } from "@/shared/analytics/calendar";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
export async function savedSearchContext(q: AnalyticsQuery) {
  const window = repo.windowFor(q);
  const observations = await db
    .select({
      id: growthMeasurementObservations.id,
      url: growthMeasurementMetrics.entityKey,
      metric: growthMeasurementMetrics.metricType,
      value: growthMeasurementObservations.value,
      start: growthMeasurementObservations.effectiveStart,
      end: growthMeasurementObservations.effectiveEnd,
      capturedAt: growthMeasurementObservations.capturedAt,
      completeness: growthMeasurementObservations.completeness,
    })
    .from(growthMeasurementObservations)
    .innerJoin(
      growthMeasurementMetrics,
      and(
        eq(growthMeasurementMetrics.id, growthMeasurementObservations.metricId),
        eq(
          growthMeasurementMetrics.projectId,
          growthMeasurementObservations.projectId,
        ),
      ),
    )
    .where(
      and(
        eq(growthMeasurementObservations.projectId, q.projectId),
        eq(growthMeasurementObservations.evidenceKind, "gsc_period"),
        eq(growthMeasurementMetrics.entityType, "url"),
        inArray(growthMeasurementMetrics.metricType, [
          "search_clicks",
          "search_impressions",
        ]),
        gte(
          growthMeasurementObservations.effectiveStart,
          window.from.slice(0, 10),
        ),
        lte(growthMeasurementObservations.effectiveEnd, window.to.slice(0, 10)),
      ),
    )
    .orderBy(desc(growthMeasurementObservations.capturedAt))
    .limit(100);
  const seen = new Set<string>();
  const rows = [];
  for (const observation of observations) {
    let url: URL;
    try {
      url = new URL(observation.url);
    } catch {
      continue;
    }
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/$/, "") || "/";
    const key = `${host}${path}:${observation.metric}:${observation.start}:${observation.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const from = calendarMidnight(observation.start, "America/Los_Angeles");
    const to = new Date(
      Date.parse(
        calendarMidnight(shiftDay(observation.end, 1), "America/Los_Angeles"),
      ) - 1,
    ).toISOString();
    const [activity] = await db
      .select({ visitors: countDistinct(analyticsEvents.contextId) })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.projectId, q.projectId),
          eq(analyticsEvents.environment, q.environment),
          eq(analyticsEvents.name, "page_view"),
          inArray(analyticsEvents.pageHost, [host, `www.${host}`]),
          inArray(
            analyticsEvents.pagePath,
            path === "/" ? ["/"] : [path, `${path}/`],
          ),
          gte(analyticsEvents.receivedAt, from),
          lte(analyticsEvents.receivedAt, to),
        ),
      );
    rows.push({
      ...observation,
      path,
      host,
      visitors: activity?.visitors ?? 0,
      timezone: "America/Los_Angeles",
      source: "Saved Google Search Console measurement",
    });
    if (rows.length === 20) break;
  }
  return {
    rows,
    definition:
      "Saved Search Console page measurements joined to observed page visitors over the same source calendar period (America/Los_Angeles). Search metrics are aggregate evidence, never personal queries. Rows may overlap and must not be summed. No new provider request was made.",
  };
}
