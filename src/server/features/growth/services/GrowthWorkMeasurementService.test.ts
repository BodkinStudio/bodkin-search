/* eslint-disable max-lines, max-lines-per-function -- the complete Work measurement contract is easiest to audit as one mocked-service suite */
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ getActionGraph: vi.fn() }));
const changes = vi.hoisted(() => ({
  listManualChangeEventGraphsForAction: vi.fn(),
  getChangeEventGraph: vi.fn(),
}));
const measurementRepository = vi.hoisted(() => ({
  getMeasurementPlanByAction: vi.fn(),
}));
const investigations = vi.hoisted(() => ({ getQualifiedWork: vi.fn() }));
const measurements = vi.hoisted(() => ({
  getMeasurement: vi.fn(),
  startMeasurement: vi.fn(),
}));
const settings = vi.hoisted(() => ({ getSettings: vi.fn() }));
const gscConnections = vi.hoisted(() => ({ getByProjectId: vi.fn() }));
const collection = vi.hoisted(() => ({
  collectGrowthWorkMeasurementEvidence: vi.fn(),
}));
const confounderDiscovery = vi.hoisted(() => ({ discover: vi.fn() }));

vi.mock("../repositories/GrowthActionsRepository", () => ({
  GrowthActionsRepository: actions,
}));
vi.mock("../repositories/GrowthChangeEventsRepository", () => ({
  GrowthChangeEventsRepository: changes,
}));
vi.mock("../repositories/GrowthMeasurementsRepository", () => ({
  GrowthMeasurementsRepository: measurementRepository,
}));
vi.mock("./GrowthInvestigationsService", () => investigations);
vi.mock("./GrowthMeasurementsService", () => ({
  GrowthMeasurementsService: measurements,
}));
vi.mock("./GrowthSettingsService", () => ({ GrowthSettingsService: settings }));
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: gscConnections,
}));
vi.mock("./GrowthWorkMeasurementCollectionService", () => ({
  collectGrowthWorkMeasurementEvidence:
    collection.collectGrowthWorkMeasurementEvidence,
  growthMeasurementSourceAvailableOn: (endDate: string) =>
    new Date(Date.parse(`${endDate}T00:00:00.000Z`) + 3 * 86_400_000)
      .toISOString()
      .slice(0, 10),
  growthMeasurementGscPropertyHash: (evidenceRef: string) =>
    /^gsc:measurement:v1:([a-f0-9]{64}):[a-f0-9]{64}$/.exec(evidenceRef)?.[1] ??
    null,
  growthMeasurementCollectionPeriods: (plan: {
    baselineStart: string;
    baselineEnd: string;
    measurementStart: string;
    measurementEnd: string;
    longMeasurementEnd: string | null;
  }) => [
    {
      periodType: "baseline" as const,
      startDate: plan.baselineStart,
      endDate: plan.baselineEnd,
    },
    {
      periodType: "measurement" as const,
      startDate: plan.measurementStart,
      endDate: plan.measurementEnd,
    },
    ...(plan.longMeasurementEnd
      ? [
          {
            periodType: "long_term" as const,
            startDate: new Date(
              Date.parse(`${plan.measurementEnd}T00:00:00.000Z`) + 86_400_000,
            )
              .toISOString()
              .slice(0, 10),
            endDate: plan.longMeasurementEnd,
          },
        ]
      : []),
  ],
}));
vi.mock("./GrowthMeasurementConfounders", () => ({
  GROWTH_MEASUREMENT_CONFOUNDER_LIMIT: 50,
  discoverGrowthMeasurementConfounders: confounderDiscovery.discover,
}));
vi.mock("./GrowthChangeLogService", () => ({
  toChangeDto: (graph: typeof change) => ({
    id: graph.event.id,
    changeType: graph.event.changeType,
    description: graph.event.description,
    happenedAt: graph.event.happenedAt,
    recordedAt: graph.event.createdAt,
    displayUrls: graph.urls,
  }),
}));
import {
  growthWorkMeasurementSchedule,
  GrowthWorkMeasurementService,
} from "./GrowthWorkMeasurementService";

const projectId = "project_1";
const actionId = "action_1";
const change = {
  event: {
    id: "change_1",
    projectId,
    creationKey: "manual-change-1",
    factHash: "a".repeat(64),
    source: "manual" as const,
    changeType: "content_updated" as const,
    description: "Published the revised pricing page.",
    happenedAt: "2026-08-01T00:00:00.000Z",
    sourceRef: null,
    createdAt: "2026-08-02T00:00:00.000Z",
  },
  urls: ["https://example.com/pricing"],
  actionIds: [actionId],
};
const defaultSettings = {
  projectId,
  growthEnabled: true,
  reportTimezone: "Europe/London",
  defaultBaselineDays: 28,
  defaultCooldownDays: 7,
  defaultPrimaryWindowDays: 28,
  defaultLongWindowDays: 55,
  createdAt: null,
  updatedAt: null,
  persisted: false as const,
};
const implementedWork = {
  id: actionId,
  status: "implemented" as const,
  stateVersion: 4,
};
const actionGraph = {
  action: implementedWork,
  targets: [
    { targetType: "url" as const, targetValue: "https://example.com/z" },
    { targetType: "keyword" as const, targetValue: "pricing software" },
    { targetType: "url" as const, targetValue: "https://example.com/a" },
  ],
  events: [],
  creationEvent: null,
};
const activePlan = {
  id: "plan_1",
  projectId,
  actionId,
  factHash: "b".repeat(64),
  status: "active" as const,
  actionVersion: 5,
  anchorAt: change.event.happenedAt,
  anchorDate: "2026-08-01",
  reportTimezone: "Europe/London",
  baselineStart: "2026-07-04",
  baselineEnd: "2026-07-31",
  cooldownEnd: "2026-08-08",
  measurementStart: "2026-08-09",
  measurementEnd: "2026-09-05",
  longMeasurementEnd: "2026-10-30",
  comparisonMode: "preceding_period" as const,
  completedAt: null,
  createdAt: "2026-08-02T12:00:00.000Z",
};
const activeMeasurement = {
  plan: activePlan,
  implementationChangeEventId: change.event.id,
  metrics: [
    {
      id: "metric_1",
      projectId,
      measurementPlanId: activePlan.id,
      metricType: "search_clicks" as const,
      entityType: "url" as const,
      entityKey: "https://example.com/a",
      isPrimary: true,
      createdAt: activePlan.createdAt,
    },
  ],
  observations: [],
  comparisons: [
    {
      metricId: "metric_1",
      baselineValue: null,
      currentValue: null,
      absoluteDelta: null,
      percentDelta: null,
      longTermValue: null,
      longTermAbsoluteDelta: null,
      longTermPercentDelta: null,
    },
  ],
  result: null,
  confoundingChangeEventIds: [],
  actionEvents: [],
  dueDate: activePlan.longMeasurementEnd,
};

describe("GrowthWorkMeasurementService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    investigations.getQualifiedWork.mockResolvedValue(implementedWork);
    actions.getActionGraph.mockResolvedValue(actionGraph);
    changes.listManualChangeEventGraphsForAction.mockResolvedValue([change]);
    changes.getChangeEventGraph.mockResolvedValue(change);
    settings.getSettings.mockResolvedValue(defaultSettings);
    measurementRepository.getMeasurementPlanByAction.mockResolvedValue(null);
    measurements.getMeasurement.mockResolvedValue(activeMeasurement);
    gscConnections.getByProjectId.mockResolvedValue(null);
    collection.collectGrowthWorkMeasurementEvidence.mockResolvedValue(
      activeMeasurement,
    );
    confounderDiscovery.discover.mockResolvedValue({
      state: "none",
      candidates: [],
    });
  });

  it("derives the fixed windows from the selected change's UTC day", () => {
    expect(
      growthWorkMeasurementSchedule(change.event.happenedAt, defaultSettings),
    ).toEqual({
      anchorAt: "2026-08-01T00:00:00.000Z",
      anchorDate: "2026-08-01",
      reportTimezone: "Europe/London",
      baselineStart: "2026-07-04",
      baselineEnd: "2026-07-31",
      cooldownEnd: "2026-08-08",
      measurementStart: "2026-08-09",
      measurementEnd: "2026-09-05",
      longMeasurementEnd: "2026-10-30",
    });
  });

  it("handles zero cooldown, a leap-month boundary, and no long window", () => {
    expect(
      growthWorkMeasurementSchedule("2024-03-01T00:00:00.000Z", {
        ...defaultSettings,
        defaultBaselineDays: 1,
        defaultCooldownDays: 0,
        defaultPrimaryWindowDays: 1,
        defaultLongWindowDays: null,
      }),
    ).toEqual({
      anchorAt: "2024-03-01T00:00:00.000Z",
      anchorDate: "2024-03-01",
      reportTimezone: "Europe/London",
      baselineStart: "2024-02-29",
      baselineEnd: "2024-02-29",
      cooldownEnd: "2024-03-01",
      measurementStart: "2024-03-02",
      measurementEnd: "2024-03-02",
      longMeasurementEnd: null,
    });

    expect(
      growthWorkMeasurementSchedule("2024-02-29T00:00:00.000Z", {
        ...defaultSettings,
        defaultLongWindowDays: null,
      }),
    ).toMatchObject({
      baselineStart: "2024-02-01",
      baselineEnd: "2024-02-28",
      cooldownEnd: "2024-03-07",
      measurementStart: "2024-03-08",
      measurementEnd: "2024-04-04",
      longMeasurementEnd: null,
    });
  });

  it("proposes an eligible plan without starting measurement", async () => {
    const result = await GrowthWorkMeasurementService.getGrowthWorkMeasurement(
      projectId,
      actionId,
    );

    expect(result).toMatchObject({
      actionId,
      actionStatus: "implemented",
      stateVersion: 4,
      state: "eligible",
      targetCount: 2,
      proposedMetrics: [
        {
          metricType: "search_clicks",
          displayTarget: "https://example.com/a",
          isPrimary: true,
        },
        {
          metricType: "search_impressions",
          displayTarget: "https://example.com/a",
          isPrimary: false,
        },
        {
          metricType: "search_clicks",
          displayTarget: "https://example.com/z",
          isPrimary: true,
        },
        {
          metricType: "search_impressions",
          displayTarget: "https://example.com/z",
          isPrimary: false,
        },
      ],
      candidates: [
        {
          change: { id: "change_1" },
          schedule: {
            anchorDate: "2026-08-01",
            baselineStart: "2026-07-04",
            measurementEnd: "2026-09-05",
          },
          unavailableReason: null,
        },
      ],
      plan: null,
      limit: 50,
    });
    expect(measurements.startMeasurement).not.toHaveBeenCalled();
  });

  it("marks an active plan inconsistent when its Work version has drifted", async () => {
    measurementRepository.getMeasurementPlanByAction.mockResolvedValue(
      activePlan,
    );
    investigations.getQualifiedWork.mockResolvedValue({
      ...implementedWork,
      status: "measuring",
      stateVersion: activePlan.actionVersion + 1,
    });

    await expect(
      GrowthWorkMeasurementService.getGrowthWorkMeasurement(
        projectId,
        actionId,
      ),
    ).resolves.toMatchObject({ state: "inconsistent" });
  });

  it.each([
    ["ready", [], "not_ready"],
    ["implemented", [], "needs_change"],
  ] as const)(
    "reports %s Work with no linked change as %s",
    async (status, linkedChanges, expectedState) => {
      investigations.getQualifiedWork.mockResolvedValue({
        ...implementedWork,
        status,
      });
      changes.listManualChangeEventGraphsForAction.mockResolvedValue(
        linkedChanges,
      );

      await expect(
        GrowthWorkMeasurementService.getGrowthWorkMeasurement(
          projectId,
          actionId,
        ),
      ).resolves.toMatchObject({ state: expectedState, plan: null });
    },
  );

  it.each([
    [0, 0],
    [26, 26],
  ])("rejects a proposal with %i URL targets", async (count, targetCount) => {
    actions.getActionGraph.mockResolvedValue({
      ...actionGraph,
      targets: Array.from({ length: count }, (_, index) => ({
        targetType: "url",
        targetValue: `https://example.com/page-${index}`,
      })),
    });

    await expect(
      GrowthWorkMeasurementService.getGrowthWorkMeasurement(
        projectId,
        actionId,
      ),
    ).resolves.toMatchObject({
      state: "unmeasurable_targets",
      targetCount,
      proposedMetrics: [],
    });
    await expect(
      GrowthWorkMeasurementService.startGrowthWorkMeasurement({
        projectId,
        actionId,
        expectedActionVersion: 4,
        implementationChangeEventId: change.event.id,
        actorId: "user_authorized",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(measurements.startMeasurement).not.toHaveBeenCalled();
  });

  it("marks future linked changes unavailable", async () => {
    const future = {
      ...change,
      event: { ...change.event, happenedAt: "2999-01-01T00:00:00.000Z" },
    };
    changes.listManualChangeEventGraphsForAction.mockResolvedValue([future]);

    await expect(
      GrowthWorkMeasurementService.getGrowthWorkMeasurement(
        projectId,
        actionId,
      ),
    ).resolves.toMatchObject({
      state: "needs_change",
      candidates: [{ schedule: null, unavailableReason: "future_change" }],
    });
  });

  it("starts with server-derived windows and canonical sorted URL metrics", async () => {
    measurementRepository.getMeasurementPlanByAction
      .mockResolvedValueOnce(null)
      .mockResolvedValue(activePlan);
    investigations.getQualifiedWork
      .mockResolvedValueOnce(implementedWork)
      .mockResolvedValue({
        ...implementedWork,
        status: "measuring",
        stateVersion: 5,
      });

    await expect(
      GrowthWorkMeasurementService.startGrowthWorkMeasurement({
        projectId,
        actionId,
        expectedActionVersion: 4,
        implementationChangeEventId: change.event.id,
        actorId: "user_authorized",
      }),
    ).resolves.toMatchObject({ state: "active", plan: { id: "plan_1" } });

    expect(measurements.startMeasurement).toHaveBeenCalledWith({
      projectId,
      actionId,
      expectedActionVersion: 4,
      implementationChangeEventId: "change_1",
      baselineStart: "2026-07-04",
      baselineEnd: "2026-07-31",
      cooldownEnd: "2026-08-08",
      measurementStart: "2026-08-09",
      measurementEnd: "2026-09-05",
      longMeasurementEnd: "2026-10-30",
      comparisonMode: "preceding_period",
      metrics: [
        {
          metricType: "search_clicks",
          entityType: "url",
          entityKey: "https://example.com/a",
          isPrimary: true,
        },
        {
          metricType: "search_impressions",
          entityType: "url",
          entityKey: "https://example.com/a",
          isPrimary: false,
        },
        {
          metricType: "search_clicks",
          entityType: "url",
          entityKey: "https://example.com/z",
          isPrimary: true,
        },
        {
          metricType: "search_impressions",
          entityType: "url",
          entityKey: "https://example.com/z",
          isPrimary: false,
        },
      ],
      actorType: "user",
      actorId: "user_authorized",
      note: "Started measurement from a selected recorded website change.",
    });
  });

  it("replays the stored plan exactly on a retry", async () => {
    measurementRepository.getMeasurementPlanByAction.mockResolvedValue(
      activePlan,
    );
    investigations.getQualifiedWork.mockResolvedValue({
      ...implementedWork,
      status: "measuring",
      stateVersion: 5,
    });

    await GrowthWorkMeasurementService.startGrowthWorkMeasurement({
      projectId,
      actionId,
      expectedActionVersion: 4,
      implementationChangeEventId: change.event.id,
      actorId: "user_authorized",
    });

    expect(measurements.startMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({
        implementationChangeEventId: "change_1",
        baselineStart: activePlan.baselineStart,
        baselineEnd: activePlan.baselineEnd,
        cooldownEnd: activePlan.cooldownEnd,
        measurementStart: activePlan.measurementStart,
        measurementEnd: activePlan.measurementEnd,
        longMeasurementEnd: activePlan.longMeasurementEnd,
        comparisonMode: activePlan.comparisonMode,
        metrics: [
          {
            metricType: "search_clicks",
            entityType: "url",
            entityKey: "https://example.com/a",
            isPrimary: true,
          },
        ],
      }),
    );
    await expect(
      GrowthWorkMeasurementService.getGrowthWorkMeasurement(
        projectId,
        actionId,
      ),
    ).resolves.toMatchObject({ proposedMetrics: [] });
  });

  it("projects an existing active plan without proposing another", async () => {
    measurementRepository.getMeasurementPlanByAction.mockResolvedValue(
      activePlan,
    );
    investigations.getQualifiedWork.mockResolvedValue({
      ...implementedWork,
      status: "measuring",
      stateVersion: 5,
    });

    await expect(
      GrowthWorkMeasurementService.getGrowthWorkMeasurement(
        projectId,
        actionId,
      ),
    ).resolves.toMatchObject({
      actionStatus: "measuring",
      stateVersion: 5,
      state: "active",
      proposedMetrics: [],
      candidates: [],
      plan: {
        id: "plan_1",
        implementationChange: { id: "change_1" },
        schedule: { anchorDate: "2026-08-01" },
        confounders: {
          state: "none",
          intervalStart: "2026-07-04",
          intervalEnd: "2026-10-30",
          candidates: [],
          limit: 50,
        },
      },
    });
    expect(confounderDiscovery.discover).toHaveBeenCalledWith(
      activeMeasurement,
    );
  });

  it("projects exact confounder candidates and closes discovery with the Result", async () => {
    measurementRepository.getMeasurementPlanByAction.mockResolvedValue(
      activePlan,
    );
    investigations.getQualifiedWork.mockResolvedValue({
      ...implementedWork,
      status: "measuring",
      stateVersion: 5,
    });
    confounderDiscovery.discover.mockResolvedValue({
      state: "complete",
      candidates: [
        {
          event: {
            ...change.event,
            id: "change_context",
            description: "Published another pricing change.",
          },
          matchedUrls: ["https://example.com/a"],
        },
      ],
    });

    await expect(
      GrowthWorkMeasurementService.getGrowthWorkMeasurement(
        projectId,
        actionId,
      ),
    ).resolves.toMatchObject({
      plan: {
        confounders: {
          state: "complete",
          intervalStart: "2026-07-04",
          intervalEnd: "2026-10-30",
          candidates: [
            {
              id: "change_context",
              description: "Published another pricing change.",
              matchedDisplayUrls: ["https://example.com/a"],
            },
          ],
        },
      },
    });

    const completedPlan = {
      ...activePlan,
      status: "completed" as const,
      completedAt: "2026-11-03T12:00:00.000Z",
    };
    measurementRepository.getMeasurementPlanByAction.mockResolvedValue(
      completedPlan,
    );
    investigations.getQualifiedWork.mockResolvedValue({
      ...implementedWork,
      status: "evaluated",
      stateVersion: 6,
    });
    measurements.getMeasurement.mockResolvedValue({
      ...activeMeasurement,
      plan: completedPlan,
      result: {
        outcome: "positive",
        confidence: 0.7,
        summary: "Clicks were higher after the recorded change.",
        evaluatedAt: "2026-11-03T12:00:00.000Z",
      },
    });
    confounderDiscovery.discover.mockClear();

    await expect(
      GrowthWorkMeasurementService.getGrowthWorkMeasurement(
        projectId,
        actionId,
      ),
    ).resolves.toMatchObject({
      state: "completed",
      plan: { confounders: { state: "closed", candidates: [] } },
    });
    expect(confounderDiscovery.discover).not.toHaveBeenCalled();
  });

  it("redacts credential-like confounder descriptions before projecting Work", async () => {
    const credential = "CONFOUNDER_DESCRIPTION_CANARY_701";
    measurementRepository.getMeasurementPlanByAction.mockResolvedValue(
      activePlan,
    );
    investigations.getQualifiedWork.mockResolvedValue({
      ...implementedWork,
      status: "measuring",
      stateVersion: 5,
    });
    confounderDiscovery.discover.mockResolvedValue({
      state: "complete",
      candidates: [
        {
          event: {
            ...change.event,
            id: "change_sensitive_context",
            description: `api_key=${credential}`,
          },
          matchedUrls: ["https://example.com/a"],
        },
      ],
    });

    const projected =
      await GrowthWorkMeasurementService.getGrowthWorkMeasurement(
        projectId,
        actionId,
      );
    expect(projected.plan?.confounders.candidates[0]?.description).toBe(
      "[redacted: recognised credential material]",
    );
    expect(JSON.stringify(projected)).not.toContain(credential);
  });

  it("projects source availability at the exact Pacific end-plus-three-day boundary without collecting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T06:59:59.000Z"));
    const octoberPlan = {
      ...activePlan,
      baselineStart: "2026-09-01",
      baselineEnd: "2026-09-30",
      measurementStart: "2026-10-01",
      measurementEnd: "2026-10-06",
      longMeasurementEnd: null,
    };
    measurementRepository.getMeasurementPlanByAction.mockResolvedValue(
      octoberPlan,
    );
    gscConnections.getByProjectId.mockResolvedValue({ id: "connection_1" });
    investigations.getQualifiedWork.mockResolvedValue({
      ...implementedWork,
      status: "measuring",
      stateVersion: 5,
    });
    measurements.getMeasurement.mockResolvedValue({
      ...activeMeasurement,
      plan: octoberPlan,
    });

    await expect(
      GrowthWorkMeasurementService.getGrowthWorkMeasurement(
        projectId,
        actionId,
      ),
    ).resolves.toMatchObject({
      plan: {
        collection: {
          state: "ready",
          canCollect: true,
          nextAvailableOn: "2026-10-09",
          periods: [
            { periodType: "baseline", status: "ready" },
            {
              periodType: "measurement",
              status: "waiting",
              sourceAvailableOn: "2026-10-09",
            },
          ],
        },
      },
    });
    vi.setSystemTime(new Date("2026-10-09T07:00:00.000Z"));
    await expect(
      GrowthWorkMeasurementService.getGrowthWorkMeasurement(
        projectId,
        actionId,
      ),
    ).resolves.toMatchObject({
      plan: {
        collection: {
          state: "ready",
          canCollect: true,
          periods: [
            { periodType: "baseline", status: "ready" },
            { periodType: "measurement", status: "ready" },
          ],
        },
      },
    });
    expect(
      collection.collectGrowthWorkMeasurementEvidence,
    ).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it.each([
    ["missing_connection", null, [], "missing_connection"],
    [
      "collected",
      { id: "connection_1" },
      [
        {
          metricId: "metric_1",
          periodType: "baseline",
          value: 12,
          completeness: 1,
          capturedAt: "2026-10-09T07:00:00.000Z",
        },
        {
          metricId: "metric_1",
          periodType: "measurement",
          value: 18,
          completeness: 1,
          capturedAt: "2026-10-09T07:00:00.000Z",
        },
      ],
      "collected",
    ],
    [
      "inconsistent",
      { id: "connection_1" },
      [
        {
          metricId: "metric_1",
          periodType: "baseline",
          value: 12,
          completeness: 0,
          capturedAt: "2026-10-09T07:00:00.000Z",
        },
      ],
      "inconsistent",
    ],
  ] as const)(
    "projects %s collection state from stored observations and connection only",
    async (_name, connection, observations, expectedState) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-10T07:00:00.000Z"));
      const noLongPlan = { ...activePlan, longMeasurementEnd: null };
      measurementRepository.getMeasurementPlanByAction.mockResolvedValue(
        noLongPlan,
      );
      investigations.getQualifiedWork.mockResolvedValue({
        ...implementedWork,
        status: "measuring",
        stateVersion: 5,
      });
      gscConnections.getByProjectId.mockResolvedValue(connection);
      measurements.getMeasurement.mockResolvedValue({
        ...activeMeasurement,
        plan: noLongPlan,
        observations: observations.map((observation) => ({
          ...observation,
          evidenceKind: "gsc_period",
          evidenceRef: `gsc:measurement:v1:${"a".repeat(64)}:${"b".repeat(64)}`,
        })),
        comparisons: [
          {
            metricId: "metric_1",
            baselineValue: 12,
            currentValue: 18,
            absoluteDelta: 6,
            percentDelta: 50,
            longTermValue: null,
            longTermAbsoluteDelta: null,
            longTermPercentDelta: null,
          },
        ],
      });
      await expect(
        GrowthWorkMeasurementService.getGrowthWorkMeasurement(
          projectId,
          actionId,
        ),
      ).resolves.toMatchObject({
        plan: { collection: { state: expectedState } },
      });
      expect(
        collection.collectGrowthWorkMeasurementEvidence,
      ).not.toHaveBeenCalled();
      vi.useRealTimers();
    },
  );

  it("marks a full period with mixed provenance as needing attention", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T07:00:00.000Z"));
    const noLongPlan = { ...activePlan, longMeasurementEnd: null };
    const secondMetric = {
      ...activeMeasurement.metrics[0],
      id: "metric_2",
      metricType: "search_impressions" as const,
      isPrimary: false,
    };
    measurementRepository.getMeasurementPlanByAction.mockResolvedValue(
      noLongPlan,
    );
    investigations.getQualifiedWork.mockResolvedValue({
      ...implementedWork,
      status: "measuring",
      stateVersion: 5,
    });
    gscConnections.getByProjectId.mockResolvedValue({ id: "connection_1" });
    measurements.getMeasurement.mockResolvedValue({
      ...activeMeasurement,
      plan: noLongPlan,
      metrics: [activeMeasurement.metrics[0], secondMetric],
      observations: [
        {
          metricId: "metric_1",
          periodType: "baseline",
          value: 12,
          completeness: 1,
          capturedAt: "2026-10-09T07:00:00.000Z",
          evidenceKind: "gsc_period",
          evidenceRef: `gsc:measurement:v1:${"a".repeat(64)}:${"b".repeat(64)}`,
        },
        {
          metricId: "metric_2",
          periodType: "baseline",
          value: 120,
          completeness: 1,
          capturedAt: "2026-10-09T08:00:00.000Z",
          evidenceKind: "gsc_period",
          evidenceRef: `gsc:measurement:v1:${"a".repeat(64)}:${"c".repeat(64)}`,
        },
      ],
      comparisons: [
        activeMeasurement.comparisons[0],
        { ...activeMeasurement.comparisons[0], metricId: "metric_2" },
      ],
    });

    await expect(
      GrowthWorkMeasurementService.getGrowthWorkMeasurement(
        projectId,
        actionId,
      ),
    ).resolves.toMatchObject({
      plan: {
        collection: {
          state: "inconsistent",
          periods: [
            { periodType: "baseline", status: "inconsistent" },
            { periodType: "measurement", status: "ready" },
          ],
        },
      },
    });
    vi.useRealTimers();
  });

  it("dispatches collection only through the server-side collection service", async () => {
    collection.collectGrowthWorkMeasurementEvidence.mockResolvedValue(
      activeMeasurement,
    );
    await GrowthWorkMeasurementService.collectGrowthWorkMeasurement({
      projectId,
      actionId,
      expectedActionVersion: 5,
    });
    expect(
      collection.collectGrowthWorkMeasurementEvidence,
    ).toHaveBeenCalledWith({
      projectId,
      actionId,
      expectedActionVersion: 5,
    });
  });

  it("rejects an unlinked anchor before starting", async () => {
    await expect(
      GrowthWorkMeasurementService.startGrowthWorkMeasurement({
        projectId,
        actionId,
        expectedActionVersion: 4,
        implementationChangeEventId: "change_unlinked",
        actorId: "user_authorized",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(measurements.startMeasurement).not.toHaveBeenCalled();
  });

  it("rejects a future anchor and a stale Work version before starting", async () => {
    const future = {
      ...change,
      event: { ...change.event, happenedAt: "2999-01-01T00:00:00.000Z" },
    };
    changes.listManualChangeEventGraphsForAction.mockResolvedValue([future]);

    await expect(
      GrowthWorkMeasurementService.startGrowthWorkMeasurement({
        projectId,
        actionId,
        expectedActionVersion: 4,
        implementationChangeEventId: future.event.id,
        actorId: "user_authorized",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    changes.listManualChangeEventGraphsForAction.mockResolvedValue([change]);
    await expect(
      GrowthWorkMeasurementService.startGrowthWorkMeasurement({
        projectId,
        actionId,
        expectedActionVersion: 3,
        implementationChangeEventId: change.event.id,
        actorId: "user_authorized",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(measurements.startMeasurement).not.toHaveBeenCalled();
  });
});
