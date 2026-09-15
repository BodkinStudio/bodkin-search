import { beforeEach, describe, expect, it, vi } from "vitest";

const changes = vi.hoisted(() => ({ getChangeEventGraph: vi.fn() }));
const measurements = vi.hoisted(() => ({ listChangeEventsByIds: vi.fn() }));
const review = vi.hoisted(() => ({ prepare: vi.fn() }));

vi.mock("../repositories/GrowthChangeEventsRepository", () => ({
  GrowthChangeEventsRepository: changes,
}));
vi.mock("../repositories/GrowthMeasurementsRepository", () => ({
  GrowthMeasurementsRepository: measurements,
}));
vi.mock("./GrowthMeasurementReview", () => ({
  prepareGrowthMeasurementReview: review.prepare,
}));
vi.mock("./GrowthChangeLogService", () => ({
  toChangeDto: vi.fn(),
}));
vi.mock("./GrowthWorkMeasurementCollectionService", () => ({
  growthMeasurementCollectionPeriods: (sourcePlan: typeof plan) => [
    {
      periodType: "baseline" as const,
      startDate: sourcePlan.baselineStart,
      endDate: sourcePlan.baselineEnd,
    },
    {
      periodType: "measurement" as const,
      startDate: sourcePlan.measurementStart,
      endDate: sourcePlan.measurementEnd,
    },
  ],
  growthMeasurementGscPropertyHash: () => null,
  growthMeasurementSourceAvailableOn: (date: string) => date,
}));

import { growthWorkMeasurementPlanDto } from "./GrowthWorkMeasurementProjection";

type ProjectionInput = Parameters<typeof growthWorkMeasurementPlanDto>[0];

const plan = {
  id: "plan_1",
  projectId: "project_1",
  actionId: "action_1",
  factHash: "a".repeat(64),
  status: "completed" as const,
  actionVersion: 5,
  anchorAt: "2026-08-01T00:00:00.000Z",
  anchorDate: "2026-08-01",
  reportTimezone: "Europe/London",
  baselineStart: "2026-07-01",
  baselineEnd: "2026-07-31",
  cooldownEnd: "2026-08-02",
  measurementStart: "2026-08-03",
  measurementEnd: "2026-08-31",
  longMeasurementEnd: null,
  comparisonMode: "preceding_period" as const,
  completedAt: "2026-09-01T12:00:00.000Z",
  createdAt: "2026-08-01T12:00:00.000Z",
};

const metric = {
  id: "metric_1",
  projectId: plan.projectId,
  measurementPlanId: plan.id,
  metricType: "search_clicks" as const,
  entityType: "url" as const,
  entityKey: "https://example.com/page",
  isPrimary: true,
  createdAt: plan.createdAt,
};

const verified = {
  plan,
  implementationChangeEventId: "anchor_1",
  implementationChangeEventHappenedAt: plan.anchorAt,
  implementationChangeEventSource: "manual" as const,
  metrics: [metric],
  observations: [],
  result: {
    id: "result_1",
    projectId: plan.projectId,
    measurementPlanId: plan.id,
    factHash: "b".repeat(64),
    observationsHash: "c".repeat(64),
    outcome: "positive" as const,
    confidence: 0.79,
    summary: "Measured summary",
    evaluatedAt: plan.completedAt,
    model: null,
    promptVersion: null,
    createdAt: plan.completedAt,
  },
  confoundingChangeEventIds: ["deleted_event", "surviving_event"],
  actionEvents: [],
  dueDate: plan.measurementEnd,
  comparisons: [
    {
      metricId: metric.id,
      metricType: metric.metricType,
      entityType: metric.entityType,
      entityKey: metric.entityKey,
      isPrimary: true,
      baselineValue: null,
      currentValue: null,
      absoluteDelta: null,
      percentDelta: null,
      longTermValue: null,
      longTermAbsoluteDelta: null,
      longTermPercentDelta: null,
    },
  ],
};

describe("growthWorkMeasurementPlanDto final review projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    review.prepare.mockResolvedValue({
      discovery: { state: "closed", candidates: [] },
      review: {
        state: "closed",
        availableOn: "2026-09-01",
        primaryEvidenceComplete: false,
        missingPrimaryEvidenceCount: 2,
        revision: null,
      },
      expectedObservationsHash: "c".repeat(64),
    });
  });

  it("redacts the immutable summary and returns only surviving selected Event details", async () => {
    const summaryCanary = "MEASUREMENT_SUMMARY_CANARY_892";
    const eventCanary = "RESULT_CONFOUNDER_CANARY_419";
    measurements.listChangeEventsByIds.mockResolvedValue([
      {
        id: "surviving_event",
        changeType: "content_updated",
        description: `authorization=Bearer ${eventCanary}`,
        happenedAt: "2026-08-15T12:00:00.000Z",
      },
    ]);

    const result = await growthWorkMeasurementPlanDto(
      {
        ...verified,
        result: {
          ...verified.result,
          summary: `api_key=${summaryCanary}`,
        },
      } satisfies ProjectionInput,
      false,
      new Date("2026-09-02T00:00:00.000Z"),
    );

    expect(result.result).toMatchObject({
      summary: "[redacted: recognised credential material]",
      confoundingChanges: [
        {
          id: "surviving_event",
          changeType: "content_updated",
          description: "[redacted: recognised credential material]",
          happenedAt: "2026-08-15T12:00:00.000Z",
        },
      ],
    });
    expect(measurements.listChangeEventsByIds).toHaveBeenCalledWith(
      "project_1",
      ["deleted_event", "surviving_event"],
    );
    expect(JSON.stringify(result)).not.toContain(summaryCanary);
    expect(JSON.stringify(result)).not.toContain(eventCanary);
  });
});
