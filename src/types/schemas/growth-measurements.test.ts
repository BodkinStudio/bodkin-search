import { describe, expect, it } from "vitest";
import {
  finalizeGrowthMeasurementSchema,
  GROWTH_MEASUREMENT_ENTITY_TYPES,
  GROWTH_MEASUREMENT_METRIC_TYPES,
  GROWTH_MEASUREMENT_OUTCOMES,
  GROWTH_MEASUREMENT_PERIOD_TYPES,
  MAX_GROWTH_MEASUREMENT_CONFOUNDERS,
  MAX_GROWTH_MEASUREMENT_METRICS,
  recordGrowthMeasurementObservationSchema,
  startGrowthMeasurementSchema,
} from "./growth-measurements";

const metric = {
  metricType: "search_clicks" as const,
  entityType: "url" as const,
  entityKey: "https://example.test/pricing",
  isPrimary: true,
};

const start = {
  projectId: "project_1",
  actionId: "action_1",
  implementationChangeEventId: "change_1",
  expectedActionVersion: 4,
  baselineStart: "2026-07-01",
  baselineEnd: "2026-07-28",
  cooldownEnd: "2026-08-07",
  measurementStart: "2026-08-08",
  measurementEnd: "2026-09-04",
  longMeasurementEnd: "2026-10-01",
  comparisonMode: "preceding_period" as const,
  metrics: [metric],
  actorType: "user" as const,
  actorId: "user_1",
  note: "Measurement started after implementation.",
};

const observation = {
  projectId: "project_1",
  measurementPlanId: "plan_1",
  metricId: "metric_1",
  periodType: "baseline" as const,
  effectiveStart: "2026-07-01",
  effectiveEnd: "2026-07-28",
  value: 42,
  completeness: 1,
  evidenceKind: "gsc_period" as const,
  evidenceRef: "gsc:site:2026-07-01:2026-07-28",
  capturedAt: "2026-08-01T10:00:00.000Z",
};

const result = {
  projectId: "project_1",
  measurementPlanId: "plan_1",
  expectedActionVersion: 5,
  outcome: "positive" as const,
  confidence: 0.75,
  summary: "Clicks increased after implementation.",
  confoundingChangeEventIds: [],
  actorType: "agent" as const,
  actorId: "growth-agent",
  note: null,
};

describe("Growth Measurement contracts", () => {
  it("accepts the closed Metric and entity vocabularies", () => {
    expect(GROWTH_MEASUREMENT_METRIC_TYPES).toEqual([
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
    ]);
    expect(GROWTH_MEASUREMENT_ENTITY_TYPES).toEqual([
      "site",
      "url",
      "keyword",
      "cluster",
    ]);
    expect(startGrowthMeasurementSchema.parse(start)).toMatchObject(start);
    expect(() =>
      startGrowthMeasurementSchema.parse({
        ...start,
        metrics: [{ ...metric, metricType: "revenue" }],
      }),
    ).toThrow();
    expect(() =>
      startGrowthMeasurementSchema.parse({
        ...start,
        metrics: [{ ...metric, entityType: "campaign" }],
      }),
    ).toThrow();
  });

  it("requires ordered valid calendar windows and one primary Metric", () => {
    expect(() =>
      startGrowthMeasurementSchema.parse({
        ...start,
        baselineEnd: "2026-02-30",
      }),
    ).toThrow("Use a valid calendar date");
    expect(() =>
      startGrowthMeasurementSchema.parse({
        ...start,
        baselineStart: "2026-07-29",
      }),
    ).toThrow("Baseline end must be on or after baseline start");
    expect(() =>
      startGrowthMeasurementSchema.parse({
        ...start,
        measurementStart: start.cooldownEnd,
      }),
    ).toThrow("Measurement must start after cooldown");
    expect(() =>
      startGrowthMeasurementSchema.parse({
        ...start,
        longMeasurementEnd: start.measurementEnd,
      }),
    ).toThrow("Long measurement end must follow the primary window");
    expect(() =>
      startGrowthMeasurementSchema.parse({
        ...start,
        metrics: [{ ...metric, isPrimary: false }],
      }),
    ).toThrow("At least one Measurement Metric must be primary");
  });

  it("permits a disabled long window and all comparison modes", () => {
    for (const comparisonMode of [
      "preceding_period",
      "year_over_year",
      "custom",
    ] as const) {
      expect(
        startGrowthMeasurementSchema.parse({
          ...start,
          longMeasurementEnd: null,
          comparisonMode,
        }),
      ).toMatchObject({ comparisonMode, longMeasurementEnd: null });
    }
  });

  it("caps Metrics and bounds Action lifecycle metadata", () => {
    expect(
      startGrowthMeasurementSchema.parse({
        ...start,
        metrics: Array.from(
          { length: MAX_GROWTH_MEASUREMENT_METRICS },
          (_, index) => ({ ...metric, entityKey: `keyword ${index}` }),
        ),
      }).metrics,
    ).toHaveLength(MAX_GROWTH_MEASUREMENT_METRICS);
    expect(() =>
      startGrowthMeasurementSchema.parse({
        ...start,
        metrics: Array.from(
          { length: MAX_GROWTH_MEASUREMENT_METRICS + 1 },
          (_, index) => ({ ...metric, entityKey: `keyword ${index}` }),
        ),
      }),
    ).toThrow();
    expect(() =>
      startGrowthMeasurementSchema.parse({
        ...start,
        expectedActionVersion: 0,
      }),
    ).toThrow();
    expect(() =>
      startGrowthMeasurementSchema.parse({ ...start, actorType: "worker" }),
    ).toThrow();
    expect(() =>
      startGrowthMeasurementSchema.parse({
        ...start,
        note: "x".repeat(5001),
      }),
    ).toThrow();
  });

  it("accepts each Observation period with shared Growth evidence", () => {
    expect(GROWTH_MEASUREMENT_PERIOD_TYPES).toEqual([
      "baseline",
      "measurement",
      "long_term",
    ]);
    for (const periodType of GROWTH_MEASUREMENT_PERIOD_TYPES) {
      expect(
        recordGrowthMeasurementObservationSchema.parse({
          ...observation,
          periodType,
        }),
      ).toMatchObject({ periodType, evidenceKind: "gsc_period" });
    }
    expect(
      recordGrowthMeasurementObservationSchema.parse({
        ...observation,
        evidenceKind: "manual_observation",
      }),
    ).toMatchObject({ evidenceKind: "manual_observation" });
    expect(() =>
      recordGrowthMeasurementObservationSchema.parse({
        ...observation,
        evidenceKind: "raw_provider_payload",
      }),
    ).toThrow();
  });

  it("requires finite scalar Observations, completeness and ordered dates", () => {
    expect(() =>
      recordGrowthMeasurementObservationSchema.parse({
        ...observation,
        value: Number.POSITIVE_INFINITY,
      }),
    ).toThrow();
    expect(() =>
      recordGrowthMeasurementObservationSchema.parse({
        ...observation,
        completeness: Number.NaN,
      }),
    ).toThrow();
    expect(() =>
      recordGrowthMeasurementObservationSchema.parse({
        ...observation,
        completeness: 1.01,
      }),
    ).toThrow();
    expect(() =>
      recordGrowthMeasurementObservationSchema.parse({
        ...observation,
        effectiveEnd: "2026-06-30",
      }),
    ).toThrow("Effective end must be on or after effective start");
    expect(() =>
      recordGrowthMeasurementObservationSchema.parse({
        ...observation,
        capturedAt: "yesterday",
      }),
    ).toThrow();
  });

  it("accepts the complete Result outcome vocabulary and bounded confidence", () => {
    expect(GROWTH_MEASUREMENT_OUTCOMES).toHaveLength(7);
    for (const outcome of GROWTH_MEASUREMENT_OUTCOMES) {
      expect(
        finalizeGrowthMeasurementSchema.parse({ ...result, outcome }),
      ).toMatchObject({ outcome });
    }
    expect(() =>
      finalizeGrowthMeasurementSchema.parse({
        ...result,
        outcome: "caused_growth",
      }),
    ).toThrow();
    expect(() =>
      finalizeGrowthMeasurementSchema.parse({
        ...result,
        confidence: Number.NEGATIVE_INFINITY,
      }),
    ).toThrow();
    expect(() =>
      finalizeGrowthMeasurementSchema.parse({ ...result, confidence: -0.01 }),
    ).toThrow();
  });

  it("pairs model provenance and normalizes bounded confounder IDs", () => {
    expect(
      finalizeGrowthMeasurementSchema.parse({
        ...result,
        confoundingChangeEventIds: ["change_2", "change_1", "change_2"],
        model: "gpt-5",
        promptVersion: "measurement-v1",
      }),
    ).toMatchObject({
      confoundingChangeEventIds: ["change_1", "change_2"],
      model: "gpt-5",
      promptVersion: "measurement-v1",
    });
    expect(() =>
      finalizeGrowthMeasurementSchema.parse({ ...result, model: "gpt-5" }),
    ).toThrow("Model and prompt version must be supplied together");
    expect(() =>
      finalizeGrowthMeasurementSchema.parse({
        ...result,
        promptVersion: "measurement-v1",
      }),
    ).toThrow("Model and prompt version must be supplied together");
    expect(() =>
      finalizeGrowthMeasurementSchema.parse({
        ...result,
        confoundingChangeEventIds: Array.from(
          { length: MAX_GROWTH_MEASUREMENT_CONFOUNDERS + 1 },
          (_, index) => `change_${index}`,
        ),
      }),
    ).toThrow();
  });

  it("bounds Result narrative and lifecycle actor metadata", () => {
    expect(() =>
      finalizeGrowthMeasurementSchema.parse({
        ...result,
        summary: "x".repeat(5001),
      }),
    ).toThrow();
    expect(() =>
      finalizeGrowthMeasurementSchema.parse({
        ...result,
        expectedActionVersion: 0,
      }),
    ).toThrow();
    expect(() =>
      finalizeGrowthMeasurementSchema.parse({
        ...result,
        actorId: "x".repeat(201),
      }),
    ).toThrow();
  });
});
