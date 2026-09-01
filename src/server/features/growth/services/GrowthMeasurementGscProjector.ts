import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type {
  GrowthMeasurementMetricType,
  GrowthMeasurementPeriodType,
} from "@/types/schemas/growth-measurements";
import type { FrozenGrowthSearchPerformanceSnapshot } from "./GrowthSearchPerformanceAdapterTypes";

type MeasurementGscMetric = {
  metricId: string;
  metricType: GrowthMeasurementMetricType;
  entityType: string;
  entityKey: string;
};

type MeasurementGscPeriod = {
  periodType: GrowthMeasurementPeriodType;
  effectiveStart: string;
  effectiveEnd: string;
};

type ProjectedGrowthMeasurementGscFact = {
  metricId: string;
  periodType: GrowthMeasurementPeriodType;
  effectiveStart: string;
  effectiveEnd: string;
  value: number;
  completeness: 1;
  evidenceKind: "gsc_period";
  evidenceRef: string;
  capturedAt: string;
};

type ProjectedGrowthMeasurementGscFacts = {
  propertyHash: string;
  evidenceRef: string;
  facts: ProjectedGrowthMeasurementGscFact[];
};

function validation(message: string): never {
  throw new AppError("VALIDATION_ERROR", message);
}

function datesInclusive(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  if (
    Number.isNaN(cursor.valueOf()) ||
    Number.isNaN(last.valueOf()) ||
    cursor.toISOString().slice(0, 10) !== start ||
    last.toISOString().slice(0, 10) !== end ||
    cursor > last
  ) {
    validation("Measurement period must use valid inclusive calendar dates");
  }
  const count =
    Math.round((last.valueOf() - cursor.valueOf()) / 86_400_000) + 1;
  for (let index = 0; index < count; index += 1) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Projects a complete, immutable GSC capture into measurement observation facts. */
export async function projectFrozenGrowthSearchPerformanceFacts(input: {
  snapshot: FrozenGrowthSearchPerformanceSnapshot;
  period: MeasurementGscPeriod;
  metrics: MeasurementGscMetric[];
}): Promise<ProjectedGrowthMeasurementGscFacts> {
  const { snapshot, period } = input;
  if (snapshot.retrievalStatus !== "exhausted")
    validation("Search Console retrieval must be exhausted before projection");
  if (
    period.effectiveStart !== snapshot.sourceWindow.startDate ||
    period.effectiveEnd !== snapshot.sourceWindow.endDate
  ) {
    validation(
      "Search Console capture window differs from the measurement period",
    );
  }

  const supported = input.metrics.filter(
    (metric) =>
      metric.entityType === "url" &&
      (metric.metricType === "search_clicks" ||
        metric.metricType === "search_impressions"),
  );
  if (supported.length !== input.metrics.length || supported.length === 0)
    validation(
      "Measurement metrics are not supported by Search Console collection",
    );
  const metricIds = new Set<string>();
  const targets = new Set<string>();
  for (const metric of supported) {
    if (!metric.metricId || metricIds.has(metric.metricId))
      validation("Measurement metric identities must be unique");
    if (!metric.entityKey || metric.entityKey.length > 2000)
      validation("Measurement URL target is invalid");
    metricIds.add(metric.metricId);
    targets.add(metric.entityKey);
  }

  const totals = new Map<string, { clicks: number; impressions: number }>();
  const expectedDates = datesInclusive(
    period.effectiveStart,
    period.effectiveEnd,
  );
  const coordinates = new Set<string>();
  for (const row of snapshot.observations) {
    if (!targets.has(row.rawUrl)) continue;
    if (row.date < period.effectiveStart || row.date > period.effectiveEnd)
      validation(
        "Search Console observation is outside the measurement period",
      );
    const coordinate = `${row.rawUrl}\u0000${row.date}`;
    if (coordinates.has(coordinate))
      validation("Search Console capture has duplicate URL/day observations");
    coordinates.add(coordinate);
    const current = totals.get(row.rawUrl) ?? { clicks: 0, impressions: 0 };
    const clicks = current.clicks + row.clicks;
    const impressions = current.impressions + row.impressions;
    if (!Number.isSafeInteger(clicks) || !Number.isSafeInteger(impressions))
      validation("Search Console measurement sum exceeds safe integer range");
    totals.set(row.rawUrl, { clicks, impressions });
  }
  for (const target of targets) {
    for (const date of expectedDates) {
      if (!coordinates.has(`${target}\u0000${date}`))
        validation("Search Console capture is incomplete for a frozen URL/day");
    }
  }

  const values = supported
    .map((metric) => ({
      metricId: metric.metricId,
      periodType: period.periodType,
      effectiveStart: period.effectiveStart,
      effectiveEnd: period.effectiveEnd,
      value:
        metric.metricType === "search_clicks"
          ? totals.get(metric.entityKey)!.clicks
          : totals.get(metric.entityKey)!.impressions,
    }))
    .toSorted((left, right) => left.metricId.localeCompare(right.metricId));
  const propertyHash = await sha256Hex(snapshot.property);
  const factsDigest = await sha256Hex(JSON.stringify(values));
  const evidenceRef = `gsc:measurement:v1:${propertyHash}:${factsDigest}`;
  return {
    propertyHash,
    evidenceRef,
    facts: values.map((fact) => ({
      ...fact,
      completeness: 1,
      evidenceKind: "gsc_period",
      evidenceRef,
      capturedAt: snapshot.capturedAt,
    })),
  };
}
