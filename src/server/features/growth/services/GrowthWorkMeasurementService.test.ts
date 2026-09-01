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
vi.mock("./GrowthEvidencePacket", () => ({
  growthEvidenceDisplayUrl: (value: string) => ({ value }),
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
      },
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
