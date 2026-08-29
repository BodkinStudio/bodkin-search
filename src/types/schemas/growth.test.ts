/* eslint-disable max-lines -- schema contracts stay grouped by their public Growth boundary */
import { describe, expect, it } from "vitest";
import {
  completeGrowthRunSchema,
  completeGrowthRunWithErrorsSchema,
  createGrowthInsightSchema,
  createGrowthRecommendationSchema,
  createManualGrowthRunSchema,
  GROWTH_SETTINGS_DEFAULTS,
  growthRecommendationTargetSchema,
  growthSettingsInputSchema,
  recordGrowthSignalSchema,
  reviewGrowthRecommendationSchema,
  updateGrowthSettingsSchema,
} from "./growth";

describe("growth settings schemas", () => {
  it("accepts the documented defaults", () => {
    expect(growthSettingsInputSchema.parse(GROWTH_SETTINGS_DEFAULTS)).toEqual(
      GROWTH_SETTINGS_DEFAULTS,
    );
  });

  it("accepts weekly ISO weekdays and a disabled long window", () => {
    expect(
      updateGrowthSettingsSchema.parse({
        projectId: "project_1",
        ...GROWTH_SETTINGS_DEFAULTS,
        reportCadence: "weekly",
        reportDay: 7,
        defaultLongWindowDays: null,
      }),
    ).toMatchObject({
      reportCadence: "weekly",
      reportDay: 7,
      defaultLongWindowDays: null,
    });
  });

  it("rejects a weekly day outside the ISO weekday range", () => {
    expect(() =>
      growthSettingsInputSchema.parse({
        ...GROWTH_SETTINGS_DEFAULTS,
        reportCadence: "weekly",
        reportDay: 8,
      }),
    ).toThrow("Weekly report day must be an ISO weekday from 1 to 7");
  });

  it("rejects an invalid timezone", () => {
    expect(() =>
      growthSettingsInputSchema.parse({
        ...GROWTH_SETTINGS_DEFAULTS,
        reportTimezone: "Mars/Olympus_Mons",
      }),
    ).toThrow("Use a valid IANA timezone");
  });

  it("rejects measurement windows outside their bounds", () => {
    expect(() =>
      growthSettingsInputSchema.parse({
        ...GROWTH_SETTINGS_DEFAULTS,
        defaultCooldownDays: 366,
      }),
    ).toThrow();
    expect(() =>
      growthSettingsInputSchema.parse({
        ...GROWTH_SETTINGS_DEFAULTS,
        defaultLongWindowDays: 0,
      }),
    ).toThrow();
  });
});

describe("Growth run and Signal schemas", () => {
  const run = {
    projectId: "project_1",
    runType: "daily_monitor" as const,
    cadenceSlot: "2026-08-29",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-29",
    detectorVersion: "detector-v1",
  };

  it("accepts valid inclusive periods, including one day", () => {
    expect(
      createManualGrowthRunSchema.parse({
        ...run,
        periodStart: "2026-08-29",
        periodEnd: "2026-08-29",
      }),
    ).toMatchObject({ ...run, periodStart: "2026-08-29" });
  });

  it("rejects invalid calendar dates and reversed periods", () => {
    expect(() =>
      createManualGrowthRunSchema.parse({ ...run, periodStart: "2026-02-30" }),
    ).toThrow();
    expect(() =>
      createManualGrowthRunSchema.parse({ ...run, periodEnd: "2026-07-31" }),
    ).toThrow("Period end must be on or after period start");
  });

  it("requires failure metadata only for partial or failed outcomes", () => {
    expect(() =>
      completeGrowthRunSchema.parse({
        projectId: "project_1",
        runId: "run_1",
        failureCode: "upstream",
        failureMessage: "No response",
      }),
    ).toThrow("Completed runs cannot carry failure details");
    expect(() =>
      completeGrowthRunWithErrorsSchema.parse({
        projectId: "project_1",
        runId: "run_1",
      }),
    ).toThrow("Failure code and message are required");
  });

  it("enforces bounded text and nullable non-negative integer costs", () => {
    expect(
      completeGrowthRunSchema.parse({
        projectId: "project_1",
        runId: "run_1",
        providerCostMinor: null,
      }),
    ).toMatchObject({ providerCostMinor: null });
    expect(
      completeGrowthRunSchema.parse({
        projectId: "project_1",
        runId: "run_1",
        providerCostMinor: 0,
      }),
    ).toMatchObject({ providerCostMinor: 0 });
    expect(() =>
      completeGrowthRunSchema.parse({
        projectId: "project_1",
        runId: "run_1",
        providerCostMinor: -1,
      }),
    ).toThrow();
    expect(() =>
      completeGrowthRunSchema.parse({
        projectId: "project_1",
        runId: "run_1",
        providerCostMinor: 1.5,
      }),
    ).toThrow();
    expect(() =>
      createManualGrowthRunSchema.parse({
        ...run,
        detectorVersion: "x".repeat(101),
      }),
    ).toThrow();
  });

  it("enforces finite Signal facts, confidence and the evidence registry", () => {
    const signal = {
      projectId: "project_1",
      runId: "run_1",
      signalType: "page_clicks_down",
      entityType: "page",
      entityRef: "https://example.test/pricing",
      metric: "clicks",
      severity: "warning" as const,
      confidence: 0,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-29",
      baselineValue: 20,
      currentValue: 10,
      deltaValue: -10,
      evidenceKind: "gsc_period" as const,
      evidenceRef: "gsc:2026-08",
      capturedAt: "2026-08-29T10:00:00.000Z",
    };
    expect(recordGrowthSignalSchema.parse(signal)).toMatchObject(signal);
    expect(() =>
      recordGrowthSignalSchema.parse({ ...signal, confidence: 1.01 }),
    ).toThrow();
    expect(() =>
      recordGrowthSignalSchema.parse({ ...signal, baselineValue: Infinity }),
    ).toThrow();
    expect(() =>
      recordGrowthSignalSchema.parse({
        ...signal,
        evidenceKind: "raw_payload",
      }),
    ).toThrow();
  });
});

describe("Growth Insight and Recommendation schemas", () => {
  const insight = {
    projectId: "project_1",
    runId: "run_1",
    creationKey: "insight:clicks-down",
    title: "Clicks fell on the pricing page",
    explanation: "Pricing-page clicks are below the preceding period.",
    hypothesis: "The loss is concentrated in non-brand commercial queries.",
    confidence: 0.5,
    signalIds: ["signal_2", "signal_1", "signal_2"],
  };

  const recommendation = {
    projectId: "project_1",
    runId: "run_1",
    creationKey: "recommendation:pricing-refresh",
    title: "Refresh the pricing page",
    rationale: "The page lost clicks for high-intent terms.",
    category: "content_refresh",
    insightIds: ["insight_2", "insight_1", "insight_2"],
    impact: 5,
    commercialRelevance: 4,
    effort: 2,
    urgency: 3,
    confidence: 0.75,
    priorityScore: 0,
    targets: [
      { type: "url" as const, value: " https://example.test/pricing " },
    ],
    steps: [" Audit   the current page ", "Draft the revised copy"],
  };

  it("deduplicates and sorts source IDs while preserving bounded facts", () => {
    expect(createGrowthInsightSchema.parse(insight)).toMatchObject({
      signalIds: ["signal_1", "signal_2"],
      confidence: 0.5,
    });
    expect(
      createGrowthRecommendationSchema.parse(recommendation),
    ).toMatchObject({
      insightIds: ["insight_1", "insight_2"],
      priorityScore: 0,
      steps: ["Audit the current page", "Draft the revised copy"],
    });
  });

  it("requires at least one source, target and step and caps each collection", () => {
    expect(() =>
      createGrowthInsightSchema.parse({ ...insight, signalIds: [] }),
    ).toThrow();
    expect(() =>
      createGrowthInsightSchema.parse({
        ...insight,
        signalIds: Array.from({ length: 101 }, (_, index) => `signal_${index}`),
      }),
    ).toThrow();
    expect(() =>
      createGrowthRecommendationSchema.parse({
        ...recommendation,
        insightIds: [],
      }),
    ).toThrow();
    expect(() =>
      createGrowthRecommendationSchema.parse({
        ...recommendation,
        targets: [],
      }),
    ).toThrow();
    expect(() =>
      createGrowthRecommendationSchema.parse({
        ...recommendation,
        targets: Array.from({ length: 101 }, (_, index) => ({
          type: "keyword",
          value: `keyword ${index}`,
        })),
      }),
    ).toThrow();
    expect(() =>
      createGrowthRecommendationSchema.parse({
        ...recommendation,
        steps: [],
      }),
    ).toThrow();
    expect(() =>
      createGrowthRecommendationSchema.parse({
        ...recommendation,
        steps: Array.from({ length: 101 }, (_, index) => `Step ${index}`),
      }),
    ).toThrow();
  });

  it("enforces bounded content and paired model provenance", () => {
    expect(() =>
      createGrowthInsightSchema.parse({
        ...insight,
        title: "x".repeat(301),
      }),
    ).toThrow();
    expect(() =>
      createGrowthInsightSchema.parse({
        ...insight,
        explanation: "x".repeat(5001),
      }),
    ).toThrow();
    expect(() =>
      createGrowthRecommendationSchema.parse({
        ...recommendation,
        rationale: "x".repeat(5001),
      }),
    ).toThrow();
    expect(() =>
      createGrowthInsightSchema.parse({ ...insight, model: "gpt-5" }),
    ).toThrow("Model and prompt version must be supplied together");
    expect(() =>
      createGrowthRecommendationSchema.parse({
        ...recommendation,
        promptVersion: "growth-v1",
      }),
    ).toThrow("Model and prompt version must be supplied together");
    expect(
      createGrowthInsightSchema.parse({
        ...insight,
        model: "gpt-5",
        promptVersion: "growth-v1",
      }),
    ).toMatchObject({ model: "gpt-5", promptVersion: "growth-v1" });
  });

  it("accepts zero and one confidence and zero priority but rejects invalid scores", () => {
    expect(
      createGrowthInsightSchema.parse({ ...insight, confidence: 0 }),
    ).toMatchObject({ confidence: 0 });
    expect(
      createGrowthInsightSchema.parse({ ...insight, confidence: 1 }),
    ).toMatchObject({ confidence: 1 });
    expect(
      createGrowthRecommendationSchema.parse({
        ...recommendation,
        confidence: 0,
        priorityScore: 0,
      }),
    ).toMatchObject({ confidence: 0, priorityScore: 0 });

    for (const [field, value] of [
      ["impact", 0],
      ["impact", 6],
      ["impact", 1.5],
      ["commercialRelevance", 0],
      ["effort", 6],
      ["urgency", 0],
      ["urgency", 4],
      ["confidence", -0.01],
      ["confidence", 1.01],
      ["confidence", Number.POSITIVE_INFINITY],
      ["priorityScore", -1],
      ["priorityScore", Number.NaN],
    ] as const) {
      expect(() =>
        createGrowthRecommendationSchema.parse({
          ...recommendation,
          [field]: value,
        }),
      ).toThrow();
    }
  });

  it("accepts only bounded canonical target inputs", () => {
    expect(
      growthRecommendationTargetSchema.parse({
        type: "keyword",
        value: "  high intent seo  ",
      }),
    ).toEqual({ type: "keyword", value: "high intent seo" });
    for (const type of ["url", "keyword", "cluster", "site"] as const) {
      expect(
        growthRecommendationTargetSchema.parse({ type, value: "target" }),
      ).toEqual({ type, value: "target" });
    }
    expect(() =>
      growthRecommendationTargetSchema.parse({
        type: "page",
        value: "https://example.test/",
      }),
    ).toThrow();
    expect(() =>
      growthRecommendationTargetSchema.parse({
        type: "keyword",
        value: "   ",
      }),
    ).toThrow();
    expect(() =>
      growthRecommendationTargetSchema.parse({
        type: "keyword",
        value: "x".repeat(2001),
      }),
    ).toThrow();
  });

  it("enforces dismissal, snooze and resolution metadata", () => {
    const review = {
      projectId: "project_1",
      recommendationId: "recommendation_1",
      expectedStatus: "proposed" as const,
      expectedVersion: 0,
    };
    const dismissalReasons = [
      "irrelevant",
      "already_planned",
      "not_commercially_important",
      "insufficient_evidence",
      "wrong_diagnosis",
      "too_much_effort",
      "duplicate",
      "defer",
    ] as const;

    for (const dismissalReason of dismissalReasons) {
      expect(
        reviewGrowthRecommendationSchema.parse({
          ...review,
          status: "dismissed",
          dismissalReason,
        }),
      ).toMatchObject({ status: "dismissed", dismissalReason });
    }
    expect(() =>
      reviewGrowthRecommendationSchema.parse({
        ...review,
        status: "dismissed",
        dismissalReason: "not_now",
      }),
    ).toThrow();
    expect(() =>
      reviewGrowthRecommendationSchema.parse({
        ...review,
        status: "accepted",
        dismissalReason: "defer",
      }),
    ).toThrow("Dismissal metadata only applies to dismissed recommendations");

    expect(
      reviewGrowthRecommendationSchema.parse({
        ...review,
        status: "snoozed",
        snoozedUntil: "2999-01-01T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "snoozed" });
    expect(
      reviewGrowthRecommendationSchema.parse({
        ...review,
        status: "snoozed",
        snoozedUntil: "2000-01-01T00:00:00.000Z",
      }),
    ).toMatchObject({ status: "snoozed" });
    expect(() =>
      reviewGrowthRecommendationSchema.parse({
        ...review,
        status: "accepted",
        snoozedUntil: "2999-01-01T00:00:00.000Z",
      }),
    ).toThrow("Snooze metadata only applies to snoozed recommendations");

    expect(
      reviewGrowthRecommendationSchema.parse({
        ...review,
        status: "merged",
        resolutionRecommendationId: "recommendation_2",
      }),
    ).toMatchObject({ status: "merged" });
    expect(() =>
      reviewGrowthRecommendationSchema.parse({
        ...review,
        status: "superseded",
      }),
    ).toThrow("Resolution recommendation is required");
    expect(() =>
      reviewGrowthRecommendationSchema.parse({
        ...review,
        status: "merged",
        resolutionRecommendationId: "recommendation_1",
      }),
    ).toThrow("A recommendation cannot resolve itself");
    expect(() =>
      reviewGrowthRecommendationSchema.parse({
        ...review,
        status: "accepted",
        resolutionRecommendationId: "recommendation_2",
      }),
    ).toThrow(
      "Resolution metadata only applies to merged or superseded recommendations",
    );
  });
});
