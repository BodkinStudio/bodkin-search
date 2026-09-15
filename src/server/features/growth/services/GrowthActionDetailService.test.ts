/* eslint-disable max-lines -- one boundary suite keeps the complete public Action chain auditable */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
  getMeasurementPlanByAction: vi.fn(),
  getMeasurement: vi.fn(),
  getGscPerformance: vi.fn(),
}));

vi.mock("../repositories/GrowthActionDetailRepository", () => ({
  GrowthActionDetailRepository: { getDetail: mocks.getDetail },
}));

vi.mock("../repositories/GrowthMeasurementsRepository", () => ({
  GrowthMeasurementsRepository: {
    getMeasurementPlanByAction: mocks.getMeasurementPlanByAction,
  },
}));

vi.mock("./GrowthMeasurementsService", () => ({
  GrowthMeasurementsService: { getMeasurement: mocks.getMeasurement },
}));

vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getPerformance: mocks.getGscPerformance },
}));

import { GrowthActionDetailService } from "./GrowthActionDetailService";

const PROJECT_ID = "project_1";
const ACTION_ID = "action_1";
const NOW = "2026-09-01T12:00:00.000Z";
const CURRENT_UPDATE = "2026-09-01T13:00:00.000Z";
const PRIVATE_CANARY = "ACTION_DETAIL_PRIVATE_CANARY_9284";
const CREDENTIAL = `refresh_token: ${PRIVATE_CANARY}`;

function credentialAfter(publicLimit: number) {
  return `${"x".repeat(publicLimit + 20)} ${CREDENTIAL}`;
}

function rootRows() {
  return {
    action: {
      id: ACTION_ID,
      projectId: PROJECT_ID,
      recommendationId: "recommendation_1",
      creationKey: PRIVATE_CANARY,
      factHash: PRIVATE_CANARY,
      title: credentialAfter(300),
      description: "d".repeat(1_100),
      category: "content",
      priorityScore: 12,
      status: "measuring",
      stateVersion: 4,
      ownerUserId: PRIVATE_CANARY,
      dueAt: "2026-09-30T12:00:00.000Z",
      approvedAt: "2026-08-01T12:00:00.000Z",
      startedAt: "2026-08-02T12:00:00.000Z",
      implementedAt: "2026-08-31T12:00:00.000Z",
      evaluatedAt: null,
      cancelledAt: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      // Current mutable state is intentionally newer than the captured asOf.
      updatedAt: CURRENT_UPDATE,
    },
    recommendation: {
      id: "recommendation_1",
      projectId: PROJECT_ID,
      runId: "run_1",
      creationKey: PRIVATE_CANARY,
      factHash: PRIVATE_CANARY,
      title: "Repair pricing visibility",
      rationale: credentialAfter(1_000),
      category: "content",
      impact: 5,
      commercialRelevance: 5,
      effort: 2,
      urgency: 3,
      confidence: 0.8,
      priorityScore: 12,
      status: "accepted",
      reviewVersion: 3,
      reviewedAt: "2026-08-02T12:00:00.000Z",
      reviewedBy: PRIVATE_CANARY,
      snoozedUntil: null,
      resolutionNote: PRIVATE_CANARY,
      createdAt: "2026-08-01T12:00:00.000Z",
    },
    run: {
      id: "run_1",
      projectId: PROJECT_ID,
      runType: "manual_analysis",
      trigger: PRIVATE_CANARY,
      status: "completed",
      cadenceSlot: PRIVATE_CANARY,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      startedAt: "2026-09-01T09:00:00.000Z",
      completedAt: "2026-09-01T10:00:00.000Z",
      detectorVersion: PRIVATE_CANARY,
      analysisVersion: PRIVATE_CANARY,
      model: PRIVATE_CANARY,
      promptVersion: PRIVATE_CANARY,
      providerCost: 999,
      failureReason: PRIVATE_CANARY,
    },
  };
}

function actionTarget(index: number) {
  if (index === 0)
    return {
      targetType: "url",
      targetValue: "https://example.com/pricing?account=private#preview",
    };
  if (index === 1)
    return {
      targetType: "url",
      targetValue: "https://user:password@example.com/private",
    };
  return { targetType: "keyword", targetValue: `keyword_${index}` };
}

function historyEvent(index: number) {
  return {
    id: `event_${index}`,
    projectId: PROJECT_ID,
    actionId: ACTION_ID,
    actionVersion: 30 - index,
    factHash: PRIVATE_CANARY,
    eventType: "status_changed",
    actorType: "agent",
    actorId: PRIVATE_CANARY,
    fromStatus: "implemented",
    toStatus: "measuring",
    note: index === 0 ? credentialAfter(500) : `Event ${index}`,
    createdAt: `2026-08-${String(31 - index).padStart(2, "0")}T10:00:00.000Z`,
  };
}

function recommendationTarget(index: number) {
  return { targetType: "keyword", targetValue: `recommendation_${index}` };
}

function recommendationStep(index: number) {
  return {
    position: index,
    content: index === 0 ? credentialAfter(1_000) : `Step ${index}`,
  };
}

function insight(index: number) {
  return {
    id: `insight_${index}`,
    projectId: PROJECT_ID,
    runId: "run_1",
    factHash: PRIVATE_CANARY,
    title: `Insight ${index}`,
    explanation: index === 0 ? credentialAfter(1_000) : `Explanation ${index}`,
    hypothesis: `Hypothesis ${index}`,
    confidence: 0.8,
    createdAt: "2026-09-01T10:00:00.000Z",
  };
}

const SIGNAL_IDS = [
  "signal_z",
  "signal_a",
  "signal_A",
  "signal_b",
  "signal_B",
  "signal_c",
];

function signal(insightId: string, id: string) {
  return {
    insightId,
    id: `${insightId}_${id}`,
    projectId: PROJECT_ID,
    runId: "run_1",
    signalType: "priority_page_decline",
    entityType: "url",
    entityRef:
      id === "signal_A" ? credentialAfter(500) : "https://example.com/pricing",
    metric: "search_clicks",
    severity: "critical",
    confidence: 0.9,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    baselineValue: 100,
    currentValue: 60,
    deltaValue: -40,
    deltaPercent: -40,
    evidenceKind: "gsc_period",
    evidenceRef: PRIVATE_CANARY,
    capturedAt: "2026-09-01T10:00:00.000Z",
  };
}

function change(index: number) {
  return {
    id: `change_${index}`,
    projectId: PROJECT_ID,
    creationKey: PRIVATE_CANARY,
    factHash: PRIVATE_CANARY,
    source: ["manual", "sherpa", "cms_webhook", "deployment"][index % 4],
    changeType: "content_updated",
    actorType: "agent",
    actorId: PRIVATE_CANARY,
    description: index === 0 ? credentialAfter(500) : `Change ${index}`,
    happenedAt: `2026-08-${String(31 - index).padStart(2, "0")}T09:00:00.000Z`,
    externalRef: PRIVATE_CANARY,
    createdAt: "2026-08-01T09:00:00.000Z",
  };
}

const CHANGE_URLS = ["z", "a", "A", "c", "b", "d"];

function detailRows(populated = false) {
  const insights = populated
    ? Array.from({ length: 6 }, (_, index) => insight(index))
    : [];
  const changes = populated
    ? Array.from({ length: 11 }, (_, index) => change(index))
    : [];
  return {
    root: rootRows(),
    actionTargets: populated
      ? Array.from({ length: 21 }, (_, index) => actionTarget(index))
      : [],
    history: populated
      ? Array.from({ length: 21 }, (_, index) => historyEvent(index))
      : [],
    recommendationTargets: populated
      ? Array.from({ length: 11 }, (_, index) => recommendationTarget(index))
      : [],
    steps: populated
      ? Array.from({ length: 11 }, (_, index) => recommendationStep(index))
      : [],
    insights,
    signals: populated
      ? insights
          .slice(0, 5)
          .flatMap(({ id }) =>
            SIGNAL_IDS.map((signalId) => signal(id, signalId)),
          )
      : [],
    changes,
    urls: populated
      ? changes.slice(0, 10).flatMap(({ id }) =>
          CHANGE_URLS.map((path) => ({
            changeEventId: id,
            url:
              id === "change_0" && path === "z"
                ? "https://example.com/sales%40example.com/private"
                : `https://example.com/${path}`,
          })),
        )
      : [],
  };
}

function metric(input: {
  id: string;
  entityType: "keyword" | "url";
  entityKey: string;
}) {
  return {
    id: input.id,
    projectId: PROJECT_ID,
    measurementPlanId: "plan_1",
    metricType: "search_clicks",
    entityType: input.entityType,
    entityKey: input.entityKey,
    isPrimary: input.id === "metric_A",
    createdAt: NOW,
  };
}

function comparison(metricId: string) {
  return {
    metricId,
    metricType: "search_clicks",
    entityType: "keyword",
    entityKey: "internal",
    isPrimary: metricId === "metric_A",
    baselineValue: 100,
    currentValue: 125,
    absoluteDelta: 25,
    percentDelta: 25,
    longTermValue: null,
    longTermAbsoluteDelta: null,
    longTermPercentDelta: null,
  };
}

function verifiedMeasurement(input: {
  status?: "active" | "completed";
  linked?: boolean;
  metrics?: ReturnType<typeof metric>[];
  completed?: boolean;
}) {
  const metrics = input.metrics ?? [
    metric({
      id: "metric_A",
      entityType: "url",
      entityKey: "https://example.com/pricing?private=1#preview",
    }),
  ];
  const completed = input.completed ?? input.status === "completed";
  return {
    plan: {
      id: "plan_1",
      projectId: PROJECT_ID,
      actionId: ACTION_ID,
      factHash: PRIVATE_CANARY,
      status: completed ? "completed" : "active",
      actionVersion: 4,
      anchorAt: "2026-08-31T12:00:00.000Z",
      anchorDate: "2026-08-31",
      reportTimezone: "Europe/London",
      baselineStart: "2026-07-01",
      baselineEnd: "2026-07-31",
      cooldownEnd: "2026-09-01",
      measurementStart: "2026-09-02",
      measurementEnd: "2026-09-30",
      longMeasurementEnd: null,
      comparisonMode: "preceding_period",
      completedAt: completed ? "2026-10-01T12:00:00.000Z" : null,
      createdAt: NOW,
    },
    implementationChangeEventId: input.linked ? "change_anchor" : null,
    implementationChangeEventHappenedAt: input.linked
      ? "2026-08-31T12:00:00.000Z"
      : null,
    implementationChangeEventSource: input.linked ? "manual" : null,
    metrics,
    observations: [
      {
        id: "observation_1",
        projectId: PROJECT_ID,
        measurementPlanId: "plan_1",
        metricId: metrics[0]?.id,
        periodType: "baseline",
        factHash: PRIVATE_CANARY,
        effectiveStart: "2026-07-01",
        effectiveEnd: "2026-07-31",
        value: 100,
        completeness: 1,
        evidenceKind: "gsc_period",
        evidenceRef: PRIVATE_CANARY,
        capturedAt: NOW,
        createdAt: NOW,
      },
    ],
    result: completed
      ? {
          id: "result_1",
          projectId: PROJECT_ID,
          measurementPlanId: "plan_1",
          factHash: PRIVATE_CANARY,
          observationsHash: PRIVATE_CANARY,
          outcome: "positive",
          confidence: 0.8,
          summary: credentialAfter(1_000),
          evaluatedAt: "2026-10-01T12:00:00.000Z",
          model: PRIVATE_CANARY,
          promptVersion: PRIVATE_CANARY,
          createdAt: "2026-10-01T12:00:00.000Z",
        }
      : null,
    confoundingChangeEventIds: completed
      ? ["change_private_1", "change_private_2"]
      : [],
    actionEvents: [],
    dueDate: "2026-09-30",
    comparisons: metrics.map(({ id }) => comparison(id)),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-01T13:00:00+01:00"));
  vi.resetAllMocks();
  mocks.getDetail.mockResolvedValue(detailRows());
  mocks.getMeasurementPlanByAction.mockResolvedValue(null);
});

afterEach(() => vi.useRealTimers());

describe("GrowthActionDetailService saved Action chain", () => {
  it("canonicalizes legacy SQLite timestamps and rejects an invalid clock before reads", async () => {
    const stored = detailRows();
    stored.root.action.createdAt = "2026-08-01 12:00:00";
    stored.root.action.updatedAt = "2026-08-02 12:00:00";
    stored.root.recommendation.createdAt = "2026-08-01 12:00:00";
    stored.root.run.startedAt = "2026-08-01 12:00:00";
    stored.root.run.completedAt = "2026-08-01 13:00:00";
    stored.history = [{ ...historyEvent(0), createdAt: "2026-08-31 10:00:00" }];
    stored.insights = [{ ...insight(0), createdAt: "2026-08-01 14:00:00" }];
    stored.changes = [{ ...change(0), happenedAt: "2026-08-31 09:00:00" }];
    mocks.getDetail.mockResolvedValue(stored);

    const result = await GrowthActionDetailService.getAction(
      { projectId: PROJECT_ID, actionId: ACTION_ID },
      { now: new Date(NOW) },
    );

    expect(result.action.createdAt).toBe("2026-08-01T12:00:00.000Z");
    expect(result.action.updatedAt).toBe("2026-08-02T12:00:00.000Z");
    expect(result.history[0]?.createdAt).toBe("2026-08-31T10:00:00.000Z");
    expect(result.source.run.completedAt).toBe("2026-08-01T13:00:00.000Z");
    expect(result.source.insights[0]?.createdAt).toBe(
      "2026-08-01T14:00:00.000Z",
    );
    expect(result.changes[0]?.happenedAt).toBe("2026-08-31T09:00:00.000Z");

    mocks.getDetail.mockClear();
    await expect(
      GrowthActionDetailService.getAction(
        { projectId: PROJECT_ID, actionId: ACTION_ID },
        { now: new Date(Number.NaN) },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.getDetail).not.toHaveBeenCalled();
  });

  it("captures one canonical asOf, preserves current state, projects privacy, and reports every overflow", async () => {
    mocks.getDetail.mockResolvedValue(detailRows(true));

    const result = await GrowthActionDetailService.getAction({
      projectId: PROJECT_ID,
      actionId: ACTION_ID,
    });

    expect(result).toMatchObject({
      asOf: NOW,
      consistency: "current_not_snapshot",
      changesAreTemporalContextNotCausalProof: true,
      action: {
        updatedAt: CURRENT_UPDATE,
        targetCoverage: { returned: 20, hasMore: true },
      },
      historyCoverage: { returned: 20, hasMore: true },
      source: {
        recommendation: {
          targetCoverage: { returned: 10, hasMore: true },
          stepCoverage: { returned: 10, hasMore: true },
        },
        insightCoverage: { returned: 5, hasMore: true },
      },
      changeCoverage: { returned: 10, hasMore: true },
      measurement: "none",
    });
    expect(mocks.getDetail).toHaveBeenCalledWith(PROJECT_ID, ACTION_ID, NOW);
    expect(mocks.getMeasurementPlanByAction).toHaveBeenCalledWith(
      PROJECT_ID,
      ACTION_ID,
    );
    expect(mocks.getMeasurement).not.toHaveBeenCalled();
    expect(mocks.getGscPerformance).not.toHaveBeenCalled();

    expect(result.action.title).toEqual({
      value: "[redacted: recognised credential material]",
      redacted: true,
      truncated: false,
    });
    expect(result.action.description).toMatchObject({
      value: "d".repeat(1_000),
      truncated: true,
    });
    expect(result.action.targets[0]).toMatchObject({
      type: "url",
      value: "https://example.com/pricing",
      queryOrFragmentOmitted: true,
      withheld: false,
    });
    expect(result.action.targets[1]).toMatchObject({
      type: "url",
      value: null,
      withheld: true,
    });
    expect(result.history[0]?.note).toMatchObject({
      redacted: true,
      truncated: false,
    });
    expect(result.source.recommendation.rationale).toMatchObject({
      redacted: true,
      truncated: false,
    });
    expect(result.source.recommendation.steps[0]).toMatchObject({
      redacted: true,
      truncated: false,
    });
    expect(result.source.insights[0]?.explanation).toMatchObject({
      redacted: true,
      truncated: false,
    });
    expect(result.source.insights[0]?.signals).toHaveLength(5);
    expect(result.source.insights[0]?.signalCoverage).toEqual({
      returned: 5,
      hasMore: true,
    });
    expect(result.source.insights[0]?.signals.map(({ id }) => id)).toEqual([
      "insight_0_signal_A",
      "insight_0_signal_B",
      "insight_0_signal_a",
      "insight_0_signal_b",
      "insight_0_signal_c",
    ]);
    expect(result.source.insights[0]?.signals[0]?.entityRef).toMatchObject({
      redacted: true,
      truncated: false,
    });
    expect(result.changes[0]?.description).toMatchObject({
      redacted: true,
      truncated: false,
    });
    expect(result.changes[0]?.urls).toHaveLength(5);
    expect(result.changes[0]?.urlCoverage).toEqual({
      returned: 5,
      hasMore: true,
    });
    expect(result.changes[0]?.urls.map(({ value }) => value)).toEqual([
      "https://example.com/A",
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
      "https://example.com/d",
    ]);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(PRIVATE_CANARY);
    for (const privateField of [
      "ownerUserId",
      "actorId",
      "factHash",
      "creationKey",
      "evidenceRef",
      "externalRef",
      "detectorVersion",
      "analysisVersion",
      "providerCost",
      "promptVersion",
    ])
      expect(serialized).not.toContain(privateField);
  });

  it("makes missing and foreign Actions indistinguishable and stops before descendants", async () => {
    mocks.getDetail.mockResolvedValue(null);

    for (const input of [
      { projectId: PROJECT_ID, actionId: "missing_action" },
      { projectId: "foreign_project", actionId: "foreign_action" },
    ]) {
      await expect(
        GrowthActionDetailService.getAction(input),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Growth Action not found",
      });
    }

    expect(mocks.getMeasurementPlanByAction).not.toHaveBeenCalled();
    expect(mocks.getMeasurement).not.toHaveBeenCalled();
    expect(mocks.getGscPerformance).not.toHaveBeenCalled();
  });
});

describe("GrowthActionDetailService Measurement projection", () => {
  it("validates an active legacy Measurement, code-unit sorts before its cap, and projects URL/text keys", async () => {
    const keywordKeys = [
      "z",
      "a",
      "A",
      "m sales@example.com",
      "B",
      "b",
      "C",
      "c",
      "D",
    ];
    const metrics = [
      ...keywordKeys.map((entityKey) =>
        metric({
          id: `metric_${entityKey}`,
          entityType: "keyword",
          entityKey,
        }),
      ),
      metric({
        id: "metric_url_B",
        entityType: "url",
        entityKey: "https://example.com/B?private=1#preview",
      }),
      metric({
        id: "metric_url_a",
        entityType: "url",
        entityKey: "https://example.com/a?private=1#preview",
      }),
    ];
    mocks.getMeasurementPlanByAction.mockResolvedValue({ id: "plan_1" });
    mocks.getMeasurement.mockResolvedValue(
      verifiedMeasurement({ metrics, linked: false }),
    );

    const result = await GrowthActionDetailService.getAction({
      projectId: PROJECT_ID,
      actionId: ACTION_ID,
    });

    expect(mocks.getMeasurement).toHaveBeenCalledWith(PROJECT_ID, "plan_1");
    expect(result.measurement).not.toBe("none");
    if (result.measurement === "none")
      throw new Error("Expected an active Measurement projection");
    expect(result.measurement.plan).toMatchObject({
      status: "active",
      anchor: { state: "legacy" },
    });
    expect(result.measurement.metricCoverage).toEqual({
      returned: 10,
      hasMore: true,
    });
    expect(
      result.measurement.metrics.map(({ entityKey }) => entityKey.value),
    ).toEqual([
      "A",
      "B",
      "C",
      "D",
      "a",
      "b",
      "c",
      "m [email omitted]",
      "z",
      "https://example.com/B",
    ]);
    expect(result.measurement.metrics[7]?.entityKey).toMatchObject({
      redacted: true,
      truncated: false,
    });
    expect(result.measurement.metrics[9]?.entityKey).toMatchObject({
      queryOrFragmentOmitted: true,
      withheld: false,
    });
    const observations = result.measurement.metrics.flatMap(
      ({ observations: rows }) => rows,
    );
    expect(observations).toHaveLength(1);
    expect(observations[0]).not.toHaveProperty("evidenceRef");
    expect(JSON.stringify(result.measurement)).not.toContain(PRIVATE_CANARY);
  });

  it("projects a completed linked Measurement without Result internals or confounder IDs", async () => {
    mocks.getMeasurementPlanByAction.mockResolvedValue({ id: "plan_1" });
    mocks.getMeasurement.mockResolvedValue(
      verifiedMeasurement({ status: "completed", linked: true }),
    );

    const result = await GrowthActionDetailService.getAction({
      projectId: PROJECT_ID,
      actionId: ACTION_ID,
    });

    expect(result.measurement).not.toBe("none");
    if (result.measurement === "none")
      throw new Error("Expected a completed Measurement projection");
    expect(result.measurement.plan).toMatchObject({
      status: "completed",
      anchor: {
        state: "linked",
        anchorAt: "2026-08-31T12:00:00.000Z",
        anchorDate: "2026-08-31",
      },
      completedAt: "2026-10-01T12:00:00.000Z",
    });
    expect(result.measurement.result).toMatchObject({
      outcome: "positive",
      confidence: 0.8,
      summary: {
        value: "[redacted: recognised credential material]",
        redacted: true,
        truncated: false,
      },
      confoundingChangeCount: 2,
    });
    const serialized = JSON.stringify(result.measurement);
    expect(serialized).not.toContain(PRIVATE_CANARY);
    expect(serialized).not.toContain("change_private_1");
    expect(serialized).not.toContain("change_private_2");
    expect(serialized).not.toContain("model");
    expect(serialized).not.toContain("promptVersion");
  });

  it("fails closed when the shared Measurement validator rejects the graph", async () => {
    const integrityError = Object.assign(
      new Error("Stored Measurement exceeds the Metric integrity limit"),
      { code: "CONFLICT" },
    );
    mocks.getMeasurementPlanByAction.mockResolvedValue({ id: "plan_1" });
    mocks.getMeasurement.mockRejectedValue(integrityError);

    await expect(
      GrowthActionDetailService.getAction({
        projectId: PROJECT_ID,
        actionId: ACTION_ID,
      }),
    ).rejects.toBe(integrityError);
    expect(mocks.getMeasurement).toHaveBeenCalledTimes(1);
    expect(mocks.getGscPerformance).not.toHaveBeenCalled();
  });
});
