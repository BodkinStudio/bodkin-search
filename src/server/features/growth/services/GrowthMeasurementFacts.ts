import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type {
  FinalizeGrowthMeasurementInput,
  GrowthMeasurementMetricInput,
  GrowthMeasurementMetricType,
  GrowthMeasurementPeriodType,
  RecordGrowthMeasurementObservationInput,
  StartGrowthMeasurementInput,
} from "@/types/schemas/growth-measurements";
import { MAX_GROWTH_MEASUREMENT_METRICS } from "@/types/schemas/growth-measurements";
import type { GrowthMeasurementsRepository } from "../repositories/GrowthMeasurementsRepository";
import { normalizeGrowthTargets } from "./GrowthTargetNormalizer";

export type MeasurementGraph = NonNullable<
  Awaited<ReturnType<typeof GrowthMeasurementsRepository.getMeasurementGraph>>
>;

export type CanonicalMetric = {
  metricType: GrowthMeasurementMetricInput["metricType"];
  entityType: GrowthMeasurementMetricInput["entityType"];
  entityKey: string;
  isPrimary: boolean;
};

export type PlanFact = {
  projectId: string;
  actionId: string;
  implementationChangeEventId?: string;
  actionVersion: number;
  anchorAt: string;
  anchorDate: string;
  reportTimezone: string;
  baselineStart: string;
  baselineEnd: string;
  cooldownEnd: string;
  measurementStart: string;
  measurementEnd: string;
  longMeasurementEnd: string | null;
  comparisonMode: StartGrowthMeasurementInput["comparisonMode"];
  metrics: CanonicalMetric[];
};

type ObservationFact = {
  projectId: string;
  measurementPlanId: string;
  metricId: string;
  periodType: GrowthMeasurementPeriodType;
  effectiveStart: string;
  effectiveEnd: string;
  value: number;
  completeness: number;
  evidenceKind: RecordGrowthMeasurementObservationInput["evidenceKind"];
  evidenceRef: string;
  capturedAt: string;
};

export type ResultFact = {
  projectId: string;
  measurementPlanId: string;
  observationsHash: string;
  outcome: FinalizeGrowthMeasurementInput["outcome"];
  confidence: number;
  summary: string;
  model: string | null;
  promptVersion: string | null;
  confoundingChangeEventIds: string[];
};

const metricKey = (metric: CanonicalMetric) =>
  `${metric.metricType}:${metric.entityType}:${metric.entityKey}`;

export function conflict(message: string): never {
  throw new AppError("CONFLICT", message);
}

export function validation(message: string): never {
  throw new AppError("VALIDATION_ERROR", message);
}

export function canonicalTimestamp(value: string, label: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) validation(`${label} is invalid`);
  return timestamp.toISOString();
}

export function calendarDateInTimezone(timestamp: string, timezone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      calendar: "iso8601",
      numberingSystem: "latn",
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestamp));
  } catch {
    conflict("Stored Growth report timezone is invalid");
  }
  const dateParts = Object.fromEntries(
    parts
      .filter(
        ({ type }) => type === "year" || type === "month" || type === "day",
      )
      .map(({ type, value: partValue }) => [type, partValue]),
  );
  if (!dateParts.year || !dateParts.month || !dateParts.day)
    conflict("Growth report timezone did not resolve a calendar date");
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

export function nextCalendarDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()))
    conflict("Stored Measurement date is invalid");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

type MissingPrimaryEvidenceCoordinate = {
  metricId: string;
  periodType: GrowthMeasurementPeriodType;
};

export function primaryEvidenceCoverage(graph: {
  plan: Pick<MeasurementGraph["plan"], "longMeasurementEnd">;
  metrics: Array<Pick<MeasurementGraph["metrics"][number], "id" | "isPrimary">>;
  observations: Array<
    Pick<
      MeasurementGraph["observations"][number],
      "metricId" | "periodType" | "completeness"
    >
  >;
}) {
  const present = new Set(
    graph.observations
      .filter(({ completeness }) => completeness === 1)
      .map(({ metricId, periodType }) => `${metricId}:${periodType}`),
  );
  const periods: GrowthMeasurementPeriodType[] = ["baseline", "measurement"];
  if (graph.plan.longMeasurementEnd) periods.push("long_term");
  const missingCoordinates = graph.metrics
    .filter(({ isPrimary }) => isPrimary)
    .toSorted((left, right) => left.id.localeCompare(right.id))
    .flatMap(({ id: metricId }) =>
      periods.flatMap((periodType) =>
        present.has(`${metricId}:${periodType}`)
          ? []
          : [
              {
                metricId,
                periodType,
              } satisfies MissingPrimaryEvidenceCoordinate,
            ],
      ),
    );
  return {
    complete: missingCoordinates.length === 0,
    missingCoordinates,
  };
}

export function assertPlanWindows(fact: PlanFact) {
  if (
    fact.baselineStart > fact.baselineEnd ||
    fact.baselineEnd >= fact.anchorDate ||
    fact.anchorDate > fact.cooldownEnd ||
    fact.cooldownEnd >= fact.measurementStart ||
    fact.measurementStart > fact.measurementEnd ||
    (fact.longMeasurementEnd != null &&
      fact.longMeasurementEnd <= fact.measurementEnd)
  ) {
    validation(
      "Measurement windows do not align with the implementation anchor",
    );
  }
}

export function canonicalizeMetrics(
  projectDomain: string,
  metrics: GrowthMeasurementMetricInput[],
) {
  if (metrics.length === 0 || metrics.length > MAX_GROWTH_MEASUREMENT_METRICS)
    validation(
      `Measurement Plans require between 1 and ${MAX_GROWTH_MEASUREMENT_METRICS} Metrics`,
    );

  const canonical = new Map<string, CanonicalMetric>();
  for (const metric of metrics) {
    const [target] = normalizeGrowthTargets(projectDomain, [
      { type: metric.entityType, value: metric.entityKey },
    ]);
    if (!target) validation("Measurement Metric target is invalid");
    const normalized: CanonicalMetric = {
      metricType: metric.metricType,
      entityType: target.targetType,
      entityKey: target.targetValue,
      isPrimary: metric.isPrimary,
    };
    const key = metricKey(normalized);
    const existing = canonical.get(key);
    if (existing && existing.isPrimary !== normalized.isPrimary)
      validation("Duplicate Measurement Metrics disagree on primary status");
    canonical.set(key, normalized);
  }

  const result = [...canonical.values()].toSorted((left, right) =>
    metricKey(left).localeCompare(metricKey(right)),
  );
  if (!result.some(({ isPrimary }) => isPrimary))
    validation("At least one Measurement Metric must be primary");
  return result;
}

export function storedPlanFact(graph: MeasurementGraph): PlanFact {
  const { plan } = graph;
  return {
    projectId: plan.projectId,
    actionId: plan.actionId,
    ...(graph.implementationChangeEventId == null
      ? {}
      : { implementationChangeEventId: graph.implementationChangeEventId }),
    actionVersion: plan.actionVersion,
    anchorAt: plan.anchorAt,
    anchorDate: plan.anchorDate,
    reportTimezone: plan.reportTimezone,
    baselineStart: plan.baselineStart,
    baselineEnd: plan.baselineEnd,
    cooldownEnd: plan.cooldownEnd,
    measurementStart: plan.measurementStart,
    measurementEnd: plan.measurementEnd,
    longMeasurementEnd: plan.longMeasurementEnd,
    comparisonMode: plan.comparisonMode,
    metrics: graph.metrics.map(
      ({ metricType, entityType, entityKey, isPrimary }) => ({
        metricType,
        entityType,
        entityKey,
        isPrimary,
      }),
    ),
  };
}

export function observationFact(
  input: RecordGrowthMeasurementObservationInput,
): ObservationFact {
  return {
    projectId: input.projectId,
    measurementPlanId: input.measurementPlanId,
    metricId: input.metricId,
    periodType: input.periodType,
    effectiveStart: input.effectiveStart,
    effectiveEnd: input.effectiveEnd,
    value: Object.is(input.value, -0) ? 0 : input.value,
    completeness: Object.is(input.completeness, -0) ? 0 : input.completeness,
    evidenceKind: input.evidenceKind,
    evidenceRef: input.evidenceRef,
    capturedAt: canonicalTimestamp(
      input.capturedAt,
      "Observation captured time",
    ),
  };
}

export function storedObservationFact(
  observation: MeasurementGraph["observations"][number],
): ObservationFact {
  return {
    projectId: observation.projectId,
    measurementPlanId: observation.measurementPlanId,
    metricId: observation.metricId,
    periodType: observation.periodType,
    effectiveStart: observation.effectiveStart,
    effectiveEnd: observation.effectiveEnd,
    value: observation.value,
    completeness: observation.completeness,
    evidenceKind: observation.evidenceKind,
    evidenceRef: observation.evidenceRef,
    capturedAt: observation.capturedAt,
  };
}

export function observationFacts(graph: {
  observations: Array<
    Pick<MeasurementGraph["observations"][number], "id" | "factHash">
  >;
}) {
  return graph.observations
    .map(({ id, factHash }) => ({ id, factHash }))
    .toSorted((left, right) => left.id.localeCompare(right.id));
}

export async function observationsHash(graph: {
  observations: Array<
    Pick<MeasurementGraph["observations"][number], "id" | "factHash">
  >;
}) {
  return sha256Hex(JSON.stringify(observationFacts(graph)));
}

export function resultFact(
  input: FinalizeGrowthMeasurementInput,
  frozenObservationsHash: string,
  confoundingChangeEventIds: string[],
): ResultFact {
  return {
    projectId: input.projectId,
    measurementPlanId: input.measurementPlanId,
    observationsHash: frozenObservationsHash,
    outcome: input.outcome,
    confidence: Object.is(input.confidence, -0) ? 0 : input.confidence,
    summary: input.summary,
    model: input.model ?? null,
    promptVersion: input.promptVersion ?? null,
    confoundingChangeEventIds,
  };
}

export function storedResultFact(graph: MeasurementGraph): ResultFact | null {
  if (!graph.result) return null;
  return {
    projectId: graph.result.projectId,
    measurementPlanId: graph.result.measurementPlanId,
    observationsHash: graph.result.observationsHash,
    outcome: graph.result.outcome,
    confidence: graph.result.confidence,
    summary: graph.result.summary,
    model: graph.result.model,
    promptVersion: graph.result.promptVersion,
    confoundingChangeEventIds: graph.confoundingChangeEventIds,
  };
}

export function assertScalar(
  metricType: GrowthMeasurementMetricType,
  value: number,
) {
  if (!Number.isFinite(value)) validation("Observation value must be finite");
  if (metricType === "search_ctr" || metricType === "organic_engagement_rate") {
    if (value < 0 || value > 1)
      validation("Ratio Measurement values must be between 0 and 1");
    return;
  }
  if (metricType === "search_average_position") {
    if (value <= 0)
      validation("Average-position Measurement values must be positive");
    return;
  }
  if (!Number.isSafeInteger(value) || value < 0)
    validation("Count Measurement values must be non-negative safe integers");
}

export function expectedPeriod(
  plan: MeasurementGraph["plan"],
  periodType: GrowthMeasurementPeriodType,
) {
  if (periodType === "baseline")
    return { start: plan.baselineStart, end: plan.baselineEnd };
  if (periodType === "measurement")
    return { start: plan.measurementStart, end: plan.measurementEnd };
  if (!plan.longMeasurementEnd)
    validation("This Measurement Plan has no long-term window");
  return {
    start: nextCalendarDate(plan.measurementEnd),
    end: plan.longMeasurementEnd,
  };
}
