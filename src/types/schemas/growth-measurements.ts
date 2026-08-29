import { z } from "zod";
import { GROWTH_ACTOR_TYPES } from "./growth-actions";
import { GROWTH_EVIDENCE_KINDS } from "./growth";

const GROWTH_MEASUREMENT_COMPARISON_MODES = [
  "preceding_period",
  "year_over_year",
  "custom",
] as const;

export const GROWTH_MEASUREMENT_METRIC_TYPES = [
  "search_clicks",
  "search_impressions",
  "search_ctr",
  "search_average_position",
  "organic_sessions",
  "organic_active_users",
  "organic_engagement_rate",
  "organic_key_events",
  "backlink_count",
  "referring_domain_count",
  "audit_issue_page_count",
] as const;

export const GROWTH_MEASUREMENT_ENTITY_TYPES = [
  "site",
  "url",
  "keyword",
  "cluster",
] as const;

export const GROWTH_MEASUREMENT_PERIOD_TYPES = [
  "baseline",
  "measurement",
  "long_term",
] as const;

export const GROWTH_MEASUREMENT_OUTCOMES = [
  "strong_positive",
  "positive",
  "inconclusive",
  "neutral",
  "negative",
  "strong_negative",
  "not_measurable",
] as const;

export const MAX_GROWTH_MEASUREMENT_METRICS = 50;
export const MAX_GROWTH_MEASUREMENT_CONFOUNDERS = 50;

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const isoDate = boundedText(10).superRefine((value, context) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    context.addIssue({ code: "custom", message: "Use YYYY-MM-DD" });
    return;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    context.addIssue({ code: "custom", message: "Use a valid calendar date" });
  }
});

const actorFields = {
  actorType: z.enum(GROWTH_ACTOR_TYPES),
  actorId: boundedText(200),
  note: boundedText(5000).nullable().optional(),
} as const;

export const growthMeasurementMetricSchema = z.object({
  metricType: z.enum(GROWTH_MEASUREMENT_METRIC_TYPES),
  entityType: z.enum(GROWTH_MEASUREMENT_ENTITY_TYPES),
  entityKey: boundedText(2000),
  isPrimary: z.boolean(),
});

export const startGrowthMeasurementSchema = z
  .object({
    projectId: boundedText(100),
    actionId: boundedText(100),
    expectedActionVersion: z.number().int().positive(),
    baselineStart: isoDate,
    baselineEnd: isoDate,
    cooldownEnd: isoDate,
    measurementStart: isoDate,
    measurementEnd: isoDate,
    longMeasurementEnd: isoDate.nullable().optional(),
    comparisonMode: z.enum(GROWTH_MEASUREMENT_COMPARISON_MODES),
    metrics: z
      .array(growthMeasurementMetricSchema)
      .min(1)
      .max(MAX_GROWTH_MEASUREMENT_METRICS),
    ...actorFields,
  })
  .superRefine((value, context) => {
    if (value.baselineStart > value.baselineEnd)
      context.addIssue({
        code: "custom",
        path: ["baselineEnd"],
        message: "Baseline end must be on or after baseline start",
      });
    if (value.baselineEnd >= value.cooldownEnd)
      context.addIssue({
        code: "custom",
        path: ["cooldownEnd"],
        message: "Cooldown end must be after the baseline",
      });
    if (value.cooldownEnd >= value.measurementStart)
      context.addIssue({
        code: "custom",
        path: ["measurementStart"],
        message: "Measurement must start after cooldown",
      });
    if (value.measurementStart > value.measurementEnd)
      context.addIssue({
        code: "custom",
        path: ["measurementEnd"],
        message: "Measurement end must be on or after measurement start",
      });
    if (
      value.longMeasurementEnd != null &&
      value.longMeasurementEnd <= value.measurementEnd
    )
      context.addIssue({
        code: "custom",
        path: ["longMeasurementEnd"],
        message: "Long measurement end must follow the primary window",
      });
    if (!value.metrics.some((metric) => metric.isPrimary))
      context.addIssue({
        code: "custom",
        path: ["metrics"],
        message: "At least one Measurement Metric must be primary",
      });
  });

export const recordGrowthMeasurementObservationSchema = z
  .object({
    projectId: boundedText(100),
    measurementPlanId: boundedText(100),
    metricId: boundedText(100),
    periodType: z.enum(GROWTH_MEASUREMENT_PERIOD_TYPES),
    effectiveStart: isoDate,
    effectiveEnd: isoDate,
    value: z.number().finite(),
    completeness: z.number().finite().min(0).max(1),
    evidenceKind: z.enum(GROWTH_EVIDENCE_KINDS),
    evidenceRef: boundedText(500),
    capturedAt: z.string().datetime({ offset: true }),
  })
  .superRefine((value, context) => {
    if (value.effectiveStart > value.effectiveEnd)
      context.addIssue({
        code: "custom",
        path: ["effectiveEnd"],
        message: "Effective end must be on or after effective start",
      });
  });

export const finalizeGrowthMeasurementSchema = z
  .object({
    projectId: boundedText(100),
    measurementPlanId: boundedText(100),
    expectedActionVersion: z.number().int().positive(),
    outcome: z.enum(GROWTH_MEASUREMENT_OUTCOMES),
    confidence: z.number().finite().min(0).max(1),
    summary: boundedText(5000),
    model: boundedText(200).nullable().optional(),
    promptVersion: boundedText(100).nullable().optional(),
    confoundingChangeEventIds: z
      .array(boundedText(100))
      .max(MAX_GROWTH_MEASUREMENT_CONFOUNDERS)
      .transform((ids) => [...new Set(ids)].toSorted()),
    ...actorFields,
  })
  .superRefine((value, context) => {
    if ((value.model == null) !== (value.promptVersion == null))
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "Model and prompt version must be supplied together",
      });
  });

export type GrowthMeasurementMetricType =
  (typeof GROWTH_MEASUREMENT_METRIC_TYPES)[number];
export type GrowthMeasurementPeriodType =
  (typeof GROWTH_MEASUREMENT_PERIOD_TYPES)[number];
export type GrowthMeasurementMetricInput = z.infer<
  typeof growthMeasurementMetricSchema
>;
export type StartGrowthMeasurementInput = z.infer<
  typeof startGrowthMeasurementSchema
>;
export type RecordGrowthMeasurementObservationInput = z.infer<
  typeof recordGrowthMeasurementObservationSchema
>;
export type FinalizeGrowthMeasurementInput = z.infer<
  typeof finalizeGrowthMeasurementSchema
>;
