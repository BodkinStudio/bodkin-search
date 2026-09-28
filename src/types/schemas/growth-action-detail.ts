import { z } from "zod";
import {
  GROWTH_ACTION_EVENT_TYPES,
  GROWTH_ACTION_STATUSES,
} from "./growth-actions";
import {
  GROWTH_CHANGE_EVENT_SOURCES,
  GROWTH_CHANGE_EVENT_TYPES,
} from "./growth-change-events";
import {
  GROWTH_MEASUREMENT_METRIC_TYPES,
  GROWTH_MEASUREMENT_OUTCOMES,
  GROWTH_MEASUREMENT_PERIOD_TYPES,
} from "./growth-measurements";
import {
  GROWTH_EVIDENCE_KINDS,
  GROWTH_RECOMMENDATION_STATUSES,
  GROWTH_RUN_STATUSES,
  GROWTH_RUN_TYPES,
  GROWTH_SIGNAL_SEVERITIES,
} from "./growth";

const TEXT_MEASUREMENT_ENTITY_TYPES = ["site", "keyword", "cluster"] as const;

const id = z.string().trim().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });
const isoDate = z
  .string()
  .length(10)
  .superRefine((value, context) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      context.addIssue({ code: "custom", message: "Use YYYY-MM-DD" });
      return;
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.valueOf()) ||
      parsed.toISOString().slice(0, 10) !== value
    )
      context.addIssue({
        code: "custom",
        message: "Use a valid calendar date",
      });
  });
const safe = (max: number) =>
  z.strictObject({
    value: z.string().min(1).max(max),
    redacted: z.boolean(),
    truncated: z.boolean(),
  });
const url = z.strictObject({
  value: z.string().url().max(2048).nullable(),
  queryOrFragmentOmitted: z.boolean(),
  withheld: z.boolean(),
});
const target = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("url"), ...url.shape }),
  z.strictObject({
    type: z.enum(["keyword", "cluster", "site"]),
    ...safe(2000).shape,
  }),
]);
const coverage = (max: number) =>
  z.strictObject({
    hasMore: z.boolean(),
    returned: z.number().int().min(0).max(max),
  });

export const growthActionDetailInputShape = {
  projectId: id.describe("Authorized project ID"),
  actionId: id.describe("Saved Growth Action ID"),
} as const;
export const growthActionDetailRequestSchema = z.strictObject(
  growthActionDetailInputShape,
);

const metricShape = {
  metricType: z.enum(GROWTH_MEASUREMENT_METRIC_TYPES),
  isPrimary: z.boolean(),
  observations: z
    .array(
      z.strictObject({
        periodType: z.enum(GROWTH_MEASUREMENT_PERIOD_TYPES),
        effectiveStart: isoDate,
        effectiveEnd: isoDate,
        value: z.number().finite(),
        completeness: z.number().finite().min(0).max(1),
        capturedAt: timestamp,
      }),
    )
    .max(3),
  comparison: z.strictObject({
    baselineValue: z.number().finite().nullable(),
    measurementValue: z.number().finite().nullable(),
    absoluteDelta: z.number().finite().nullable(),
    percentDelta: z.number().finite().nullable(),
    longTermValue: z.number().finite().nullable(),
    longTermAbsoluteDelta: z.number().finite().nullable(),
    longTermPercentDelta: z.number().finite().nullable(),
  }),
} as const;
const metric = z.discriminatedUnion("entityType", [
  z.strictObject({
    ...metricShape,
    entityType: z.literal("url"),
    entityKey: url,
  }),
  z.strictObject({
    ...metricShape,
    entityType: z.enum(TEXT_MEASUREMENT_ENTITY_TYPES),
    entityKey: safe(2000),
  }),
]);

export const growthActionDetailDtoSchema = z.strictObject({
  asOf: timestamp,
  consistency: z.literal("current_not_snapshot"),
  changesAreTemporalContextNotCausalProof: z.literal(true),
  action: z.strictObject({
    id,
    title: safe(300),
    description: safe(1000),
    category: safe(100),
    priorityScore: z.number().finite().nonnegative(),
    status: z.enum(GROWTH_ACTION_STATUSES),
    version: z.number().int().nonnegative(),
    dueAt: timestamp,
    approvedAt: timestamp,
    startedAt: timestamp.nullable(),
    implementedAt: timestamp.nullable(),
    evaluatedAt: timestamp.nullable(),
    cancelledAt: timestamp.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
    targets: z.array(target).max(20),
    targetCoverage: coverage(20),
  }),
  history: z
    .array(
      z.strictObject({
        version: z.number().int().nonnegative(),
        eventType: z.enum(GROWTH_ACTION_EVENT_TYPES),
        fromStatus: z.enum(GROWTH_ACTION_STATUSES).nullable(),
        toStatus: z.enum(GROWTH_ACTION_STATUSES).nullable(),
        note: safe(500).nullable(),
        createdAt: timestamp,
      }),
    )
    .max(20),
  historyCoverage: coverage(20),
  source: z.strictObject({
    run: z.strictObject({
      runType: z.enum(GROWTH_RUN_TYPES),
      status: z.enum(GROWTH_RUN_STATUSES),
      periodStart: isoDate,
      periodEnd: isoDate,
      startedAt: timestamp,
      completedAt: timestamp.nullable(),
    }),
    recommendation: z.strictObject({
      id,
      status: z.enum(GROWTH_RECOMMENDATION_STATUSES),
      title: safe(300),
      rationale: safe(1000),
      category: safe(100),
      impact: z.number().int().min(1).max(5),
      commercialRelevance: z.number().int().min(1).max(5),
      effort: z.number().int().min(1).max(5),
      urgency: z.number().int().min(1).max(3),
      confidence: z.number().finite().min(0).max(1),
      priorityScore: z.number().finite().nonnegative(),
      createdAt: timestamp,
      reviewedAt: timestamp.nullable(),
      targets: z.array(target).max(10),
      targetCoverage: coverage(10),
      steps: z.array(safe(1000)).max(10),
      stepCoverage: coverage(10),
    }),
    insights: z
      .array(
        z.strictObject({
          id,
          title: safe(300),
          explanation: safe(1000),
          hypothesis: safe(1000),
          confidence: z.number().finite().min(0).max(1),
          createdAt: timestamp,
          signals: z
            .array(
              z.strictObject({
                id,
                signalType: safe(100),
                entityType: safe(100),
                entityRef: safe(500),
                metric: safe(200),
                severity: z.enum(GROWTH_SIGNAL_SEVERITIES),
                confidence: z.number().finite().min(0).max(1),
                periodStart: isoDate,
                periodEnd: isoDate,
                baselineValue: z.number().finite(),
                currentValue: z.number().finite(),
                deltaValue: z.number().finite(),
                deltaPercent: z.number().finite().nullable(),
                evidenceKind: z.enum(GROWTH_EVIDENCE_KINDS),
                capturedAt: timestamp,
              }),
            )
            .max(5),
          signalCoverage: coverage(5),
        }),
      )
      .max(5),
    insightCoverage: coverage(5),
  }),
  changes: z
    .array(
      z.strictObject({
        id,
        source: z.enum(GROWTH_CHANGE_EVENT_SOURCES),
        changeType: z.enum(GROWTH_CHANGE_EVENT_TYPES),
        description: safe(500),
        happenedAt: timestamp,
        urls: z.array(url).max(5),
        urlCoverage: coverage(5),
      }),
    )
    .max(10),
  changeCoverage: coverage(10),
  measurement: z.union([
    z.literal("none"),
    z.strictObject({
      plan: z.strictObject({
        id,
        status: z.enum(["active", "completed"]),
        actionVersion: z.number().int().positive(),
        anchor: z.strictObject({
          state: z.enum(["linked", "legacy"]),
          anchorAt: timestamp,
          anchorDate: isoDate,
        }),
        reportTimezone: z.string().min(1).max(100),
        comparisonMode: z.enum([
          "preceding_period",
          "year_over_year",
          "custom",
        ]),
        baselineStart: isoDate,
        baselineEnd: isoDate,
        cooldownEnd: isoDate,
        measurementStart: isoDate,
        measurementEnd: isoDate,
        longMeasurementEnd: isoDate.nullable(),
        dueDate: isoDate,
        completedAt: timestamp.nullable(),
      }),
      metrics: z.array(metric).max(10),
      metricCoverage: coverage(10),
      result: z
        .strictObject({
          outcome: z.enum(GROWTH_MEASUREMENT_OUTCOMES),
          confidence: z.number().finite().min(0).max(1),
          summary: safe(1000),
          evaluatedAt: timestamp,
          confoundingChangeCount: z.number().int().min(0).max(50),
        })
        .nullable(),
    }),
  ]),
});

export type GrowthActionDetailRequest = z.output<
  typeof growthActionDetailRequestSchema
>;
export type GrowthActionDetailDto = z.output<
  typeof growthActionDetailDtoSchema
>;
