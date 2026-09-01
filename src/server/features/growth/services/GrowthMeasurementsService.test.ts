/* eslint-disable max-lines -- the complete measurement lifecycle is easiest to audit as one mocked-service suite */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/server/lib/audit/ids";
import type { GrowthActionStatus } from "@/types/schemas/growth-actions";
import type {
  FinalizeGrowthMeasurementInput,
  GrowthMeasurementMetricInput,
  GrowthMeasurementMetricType,
  GrowthMeasurementPeriodType,
  RecordGrowthMeasurementObservationInput,
  StartGrowthMeasurementInput,
} from "@/types/schemas/growth-measurements";
import type {
  FinalizeMeasurementGraphInput,
  RecordMeasurementObservationInput,
  StartMeasurementGraphInput,
} from "../repositories/GrowthMeasurementsWriter";

const repository = vi.hoisted(() => ({
  projectDomain: vi.fn(),
  getAction: vi.fn(),
  getLinkedManualChangeEvent: vi.fn(),
  getMeasurementPlan: vi.fn(),
  getMeasurementPlanByAction: vi.fn(),
  getMeasurementMetric: vi.fn(),
  getMeasurementObservation: vi.fn(),
  getMeasurementGraph: vi.fn(),
  listChangeEventsByIds: vi.fn(),
  startMeasurementGraph: vi.fn(),
  recordMeasurementObservation: vi.fn(),
  finalizeMeasurementGraph: vi.fn(),
}));

const settings = vi.hoisted(() => ({ getSettings: vi.fn() }));

vi.mock("../repositories/GrowthMeasurementsRepository", () => ({
  GrowthMeasurementsRepository: repository,
}));

vi.mock("./GrowthSettingsService", () => ({
  GrowthSettingsService: settings,
}));

import { GrowthMeasurementsService } from "./GrowthMeasurementsService";

type ActionRow = {
  id: string;
  projectId: string;
  recommendationId: string;
  creationKey: string;
  factHash: string;
  title: string;
  description: string;
  category: string;
  priorityScore: number;
  status: GrowthActionStatus;
  stateVersion: number;
  ownerUserId: string | null;
  dueAt: string;
  approvedAt: string;
  startedAt: string | null;
  implementedAt: string | null;
  evaluatedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PlanRow = {
  id: string;
  projectId: string;
  actionId: string;
  factHash: string;
  status: "active" | "completed";
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
  comparisonMode: "preceding_period" | "year_over_year" | "custom";
  completedAt: string | null;
  createdAt: string;
};

type MetricRow = {
  id: string;
  projectId: string;
  measurementPlanId: string;
  metricType: GrowthMeasurementMetricInput["metricType"];
  entityType: GrowthMeasurementMetricInput["entityType"];
  entityKey: string;
  isPrimary: boolean;
  createdAt: string;
};

type ObservationRow = RecordMeasurementObservationInput & {
  createdAt: string;
};

type ResultRow = {
  id: string;
  projectId: string;
  measurementPlanId: string;
  factHash: string;
  observationsHash: string;
  outcome: FinalizeGrowthMeasurementInput["outcome"];
  confidence: number;
  summary: string;
  evaluatedAt: string;
  model: string | null;
  promptVersion: string | null;
  createdAt: string;
};

type ActionEventRow = {
  id: string;
  projectId: string;
  actionId: string;
  actionVersion: number;
  factHash: string;
  eventType: "status_changed";
  actorType: "user" | "agent" | "system";
  actorId: string;
  fromStatus: GrowthActionStatus;
  toStatus: GrowthActionStatus;
  note: string | null;
  createdAt: string;
};

type StoredGraph = {
  plan: PlanRow;
  implementationChangeEventId: string | null;
  implementationChangeEventHappenedAt: string | null;
  implementationChangeEventSource: "manual" | null;
  metrics: MetricRow[];
  observations: ObservationRow[];
  result: ResultRow | null;
  confoundingChangeEventIds: string[];
  actionEvents: ActionEventRow[];
};

const projectId = "project_1";
const actionId = "action_1";
const implementedVersion = 4;
const implementedAt = "2026-09-01T00:30:00.000Z";
const createdAt = "2026-09-01T00:31:00.000Z";
const graphKey = (scope: string, id: string) => `${scope}:${id}`;

function makeAction(overrides: Partial<ActionRow> = {}): ActionRow {
  return {
    id: actionId,
    projectId,
    recommendationId: "recommendation_1",
    creationKey: "repair-pricing",
    factHash: "a".repeat(64),
    title: "Repair pricing visibility",
    description: "Rewrite the pricing page.",
    category: "content",
    priorityScore: 9,
    status: "implemented",
    stateVersion: implementedVersion,
    ownerUserId: null,
    dueAt: "2026-09-01T00:00:00.000Z",
    approvedAt: "2026-08-01T00:00:00.000Z",
    startedAt: "2026-08-02T00:00:00.000Z",
    implementedAt,
    evaluatedAt: null,
    cancelledAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: implementedAt,
    ...overrides,
  };
}

const defaultMetric: GrowthMeasurementMetricInput = {
  metricType: "search_clicks",
  entityType: "url",
  entityKey: "https://example.com/Pricing",
  isPrimary: true,
};

function startInput(
  overrides: Partial<StartGrowthMeasurementInput> = {},
): StartGrowthMeasurementInput {
  return {
    projectId,
    actionId,
    implementationChangeEventId: "change_a",
    expectedActionVersion: implementedVersion,
    baselineStart: "2026-08-01",
    baselineEnd: "2026-08-30",
    cooldownEnd: "2026-09-02",
    measurementStart: "2026-09-03",
    measurementEnd: "2026-09-30",
    longMeasurementEnd: "2026-10-31",
    comparisonMode: "preceding_period",
    metrics: [defaultMetric],
    actorType: "agent",
    actorId: "growth-agent",
    note: "Start measurement",
    ...overrides,
  };
}

function nextDate(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function observationInput(
  graph: StoredGraph,
  metricId: string,
  periodType: GrowthMeasurementPeriodType,
  overrides: Partial<RecordGrowthMeasurementObservationInput> = {},
): RecordGrowthMeasurementObservationInput {
  const period =
    periodType === "baseline"
      ? { start: graph.plan.baselineStart, end: graph.plan.baselineEnd }
      : periodType === "measurement"
        ? {
            start: graph.plan.measurementStart,
            end: graph.plan.measurementEnd,
          }
        : {
            start: nextDate(graph.plan.measurementEnd),
            end: graph.plan.longMeasurementEnd ?? graph.plan.measurementEnd,
          };
  return {
    projectId: graph.plan.projectId,
    measurementPlanId: graph.plan.id,
    metricId,
    periodType,
    effectiveStart: period.start,
    effectiveEnd: period.end,
    value: 10,
    completeness: 1,
    evidenceKind: "manual_observation",
    evidenceRef: `${metricId}:${periodType}`,
    capturedAt: "2026-11-01T12:30:00+01:00",
    ...overrides,
  };
}

function finalizeInput(
  graph: StoredGraph,
  overrides: Partial<FinalizeGrowthMeasurementInput> = {},
): FinalizeGrowthMeasurementInput {
  return {
    projectId: graph.plan.projectId,
    measurementPlanId: graph.plan.id,
    expectedActionVersion: graph.plan.actionVersion,
    outcome: "positive",
    confidence: 0.8,
    summary: "The primary metric improved after the implementation.",
    model: null,
    promptVersion: null,
    confoundingChangeEventIds: [],
    actorType: "agent",
    actorId: "growth-agent",
    note: "Finish measurement",
    ...overrides,
  };
}

function findMetric(
  graph: StoredGraph,
  metricType: GrowthMeasurementMetricType,
) {
  const metric = graph.metrics.find((row) => row.metricType === metricType);
  if (!metric) throw new Error(`Expected ${metricType} Metric`);
  return metric;
}

function installStore() {
  const actions = new Map<string, ActionRow>([
    [`${projectId}:${actionId}`, makeAction()],
  ]);
  const graphs = new Map<string, StoredGraph>();
  const changeEvents = new Set([
    `${projectId}:change_a`,
    `${projectId}:change_b`,
    "project_2:foreign_change",
  ]);
  const startWrites: StartMeasurementGraphInput[] = [];
  const observationWrites: RecordMeasurementObservationInput[] = [];
  const finalizeWrites: FinalizeMeasurementGraphInput[] = [];

  const getGraph = (scope: string, id: string) =>
    graphs.get(graphKey(scope, id)) ?? null;

  const setAction = (action: ActionRow | null) => {
    const key = `${projectId}:${actionId}`;
    if (action) actions.set(key, action);
    else actions.delete(key);
  };

  const insertObservation = async (
    graph: StoredGraph,
    input: RecordGrowthMeasurementObservationInput,
    id: string,
  ) => {
    const fact = {
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
      capturedAt: new Date(input.capturedAt).toISOString(),
    };
    graph.observations.push({
      id,
      ...fact,
      factHash: await sha256Hex(JSON.stringify(fact)),
      createdAt,
    });
  };

  const commitFinalization = (write: FinalizeMeasurementGraphInput) => {
    const graph = getGraph(write.projectId, write.measurementPlanId);
    const action = actions.get(`${write.projectId}:${write.actionId}`);
    if (!graph || graph.result || !action) return;
    const currentFacts = graph.observations
      .map(({ id, factHash }) => ({ id, factHash }))
      .toSorted((left, right) => left.id.localeCompare(right.id));
    const expectedFacts = write.observations.toSorted((left, right) =>
      left.id.localeCompare(right.id),
    );
    if (
      graph.plan.status !== "active" ||
      graph.plan.factHash !== write.measurementPlanFactHash ||
      action.status !== "measuring" ||
      action.stateVersion !== write.expectedActionVersion ||
      JSON.stringify(currentFacts) !== JSON.stringify(expectedFacts) ||
      write.confoundingChangeEventIds.some(
        (id) => !changeEvents.has(`${write.projectId}:${id}`),
      )
    ) {
      return;
    }
    graph.result = {
      id: write.id,
      projectId: write.projectId,
      measurementPlanId: write.measurementPlanId,
      factHash: write.factHash,
      observationsHash: write.observationsHash,
      outcome: write.outcome,
      confidence: write.confidence,
      summary: write.summary,
      evaluatedAt: write.evaluatedAt,
      model: write.model,
      promptVersion: write.promptVersion,
      createdAt: write.evaluatedAt,
    };
    graph.confoundingChangeEventIds = write.confoundingChangeEventIds;
    graph.plan.status = "completed";
    graph.plan.completedAt = write.evaluatedAt;
    graph.actionEvents.push({
      id: write.eventId,
      projectId: write.projectId,
      actionId: write.actionId,
      actionVersion: write.expectedActionVersion + 1,
      factHash: write.eventFactHash,
      eventType: "status_changed",
      actorType: write.actorType,
      actorId: write.actorId,
      fromStatus: "measuring",
      toStatus: "evaluated",
      note: write.note,
      createdAt: write.evaluatedAt,
    });
    actions.set(`${write.projectId}:${write.actionId}`, {
      ...action,
      status: "evaluated",
      stateVersion: action.stateVersion + 1,
      evaluatedAt: write.evaluatedAt,
      updatedAt: write.evaluatedAt,
    });
  };

  repository.projectDomain.mockImplementation(async (scope: string) =>
    scope === projectId ? "example.com" : null,
  );
  repository.getAction.mockImplementation(
    async (scope: string, id: string) => actions.get(`${scope}:${id}`) ?? null,
  );
  repository.getLinkedManualChangeEvent.mockImplementation(
    async (scope: string, targetActionId: string, eventId: string) =>
      scope === projectId &&
      targetActionId === actionId &&
      eventId === "change_a"
        ? {
            id: eventId,
            projectId: scope,
            source: "manual",
            happenedAt: implementedAt,
          }
        : null,
  );
  repository.getMeasurementPlan.mockImplementation(
    async (scope: string, id: string) => getGraph(scope, id)?.plan ?? null,
  );
  repository.getMeasurementPlanByAction.mockImplementation(
    async (scope: string, targetActionId: string) =>
      [...graphs.values()].find(
        ({ plan }) =>
          plan.projectId === scope && plan.actionId === targetActionId,
      )?.plan ?? null,
  );
  repository.getMeasurementMetric.mockImplementation(
    async (scope: string, planId: string, metricId: string) =>
      getGraph(scope, planId)?.metrics.find(({ id }) => id === metricId) ??
      null,
  );
  repository.getMeasurementObservation.mockImplementation(
    async (
      scope: string,
      planId: string,
      metricId: string,
      periodType: GrowthMeasurementPeriodType,
    ) =>
      getGraph(scope, planId)?.observations.find(
        (row) => row.metricId === metricId && row.periodType === periodType,
      ) ?? null,
  );
  repository.getMeasurementGraph.mockImplementation(
    async (scope: string, id: string) => getGraph(scope, id),
  );
  repository.listChangeEventsByIds.mockImplementation(
    async (scope: string, ids: string[]) =>
      ids
        .filter((id) => changeEvents.has(`${scope}:${id}`))
        .map((id) => ({ id, projectId: scope })),
  );
  repository.startMeasurementGraph.mockImplementation(
    async (write: StartMeasurementGraphInput) => {
      startWrites.push(write);
      const action = actions.get(`${write.projectId}:${write.actionId}`);
      if (
        !action ||
        action.status !== "implemented" ||
        action.stateVersion !== write.expectedActionVersion ||
        write.implementationChangeEventId !== "change_a"
      ) {
        return;
      }
      const existing = [...graphs.values()].some(
        ({ plan }) =>
          plan.projectId === write.projectId &&
          plan.actionId === write.actionId,
      );
      if (existing) return;
      const plan: PlanRow = {
        id: write.id,
        projectId: write.projectId,
        actionId: write.actionId,
        factHash: write.factHash,
        status: "active",
        actionVersion: write.expectedActionVersion + 1,
        anchorAt: write.anchorAt,
        anchorDate: write.anchorDate,
        reportTimezone: write.reportTimezone,
        baselineStart: write.baselineStart,
        baselineEnd: write.baselineEnd,
        cooldownEnd: write.cooldownEnd,
        measurementStart: write.measurementStart,
        measurementEnd: write.measurementEnd,
        longMeasurementEnd: write.longMeasurementEnd,
        comparisonMode: write.comparisonMode,
        completedAt: null,
        createdAt,
      };
      const graph: StoredGraph = {
        plan,
        implementationChangeEventId: write.implementationChangeEventId,
        implementationChangeEventHappenedAt: write.anchorAt,
        implementationChangeEventSource: "manual",
        metrics: write.metrics.map((metric) => ({
          ...metric,
          projectId: write.projectId,
          measurementPlanId: write.id,
          createdAt,
        })),
        observations: [],
        result: null,
        confoundingChangeEventIds: [],
        actionEvents: [
          {
            id: write.eventId,
            projectId: write.projectId,
            actionId: write.actionId,
            actionVersion: write.expectedActionVersion + 1,
            factHash: write.eventFactHash,
            eventType: "status_changed",
            actorType: write.actorType,
            actorId: write.actorId,
            fromStatus: "implemented",
            toStatus: "measuring",
            note: write.note,
            createdAt,
          },
        ],
      };
      graphs.set(graphKey(write.projectId, write.id), graph);
      actions.set(`${write.projectId}:${write.actionId}`, {
        ...action,
        status: "measuring",
        stateVersion: action.stateVersion + 1,
        updatedAt: createdAt,
      });
    },
  );
  repository.recordMeasurementObservation.mockImplementation(
    async (write: RecordMeasurementObservationInput) => {
      observationWrites.push(write);
      const graph = getGraph(write.projectId, write.measurementPlanId);
      if (
        !graph ||
        graph.plan.status !== "active" ||
        !graph.metrics.some(({ id }) => id === write.metricId) ||
        graph.observations.some(
          (row) =>
            row.metricId === write.metricId &&
            row.periodType === write.periodType,
        )
      ) {
        return;
      }
      graph.observations.push({ ...write, createdAt });
    },
  );
  repository.finalizeMeasurementGraph.mockImplementation(
    async (write: FinalizeMeasurementGraphInput) => {
      finalizeWrites.push(write);
      commitFinalization(write);
    },
  );

  return {
    actions,
    graphs,
    startWrites,
    observationWrites,
    finalizeWrites,
    setAction,
    insertObservation,
    commitFinalization,
  };
}

async function startPlan(
  store: ReturnType<typeof installStore>,
  input: StartGrowthMeasurementInput = startInput(),
): Promise<StoredGraph> {
  const result = await GrowthMeasurementsService.startMeasurement(input);
  const graph = store.graphs.get(
    graphKey(result.plan.projectId, result.plan.id),
  );
  if (!graph) throw new Error("Expected stored Measurement graph");
  return graph;
}

async function recordPrimaryEvidence(graph: StoredGraph) {
  for (const metric of graph.metrics.filter(({ isPrimary }) => isPrimary)) {
    const periods: GrowthMeasurementPeriodType[] = ["baseline", "measurement"];
    if (graph.plan.longMeasurementEnd) periods.push("long_term");
    for (const [index, period] of periods.entries()) {
      await GrowthMeasurementsService.recordObservation(
        observationInput(graph, metric.id, period, { value: 10 + index }),
      );
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.getSettings.mockResolvedValue({
    projectId,
    reportTimezone: "America/Los_Angeles",
    persisted: true,
  });
});

describe("GrowthMeasurementsService start", () => {
  it("measures directly completed work using implementation time, with no invented start", async () => {
    const store = installStore();
    store.setAction(makeAction({ stateVersion: 1, startedAt: null }));

    const result = await GrowthMeasurementsService.startMeasurement(
      startInput({ expectedActionVersion: 1 }),
    );

    expect(result.plan).toMatchObject({
      anchorAt: implementedAt,
      actionVersion: 2,
      status: "active",
    });
    expect(await repository.getAction(projectId, actionId)).toMatchObject({
      status: "measuring",
      stateVersion: 2,
      startedAt: null,
      implementedAt,
    });
  });

  it("freezes the manual UTC implementation date near report-timezone midnight", async () => {
    const { startWrites } = installStore();

    const result =
      await GrowthMeasurementsService.startMeasurement(startInput());

    expect(result.plan).toMatchObject({
      anchorAt: "2026-09-01T00:30:00.000Z",
      anchorDate: "2026-09-01",
      reportTimezone: "America/Los_Angeles",
      actionVersion: 5,
      status: "active",
    });
    expect(startWrites[0]).toMatchObject({
      anchorAt: "2026-09-01T00:30:00.000Z",
      anchorDate: "2026-09-01",
      reportTimezone: "America/Los_Angeles",
      expectedActionVersion: 4,
    });
  });

  it("canonicalizes, sorts, and deduplicates Metrics before the atomic write", async () => {
    const { startWrites } = installStore();
    const metrics: GrowthMeasurementMetricInput[] = [
      {
        metricType: "search_impressions",
        entityType: "keyword",
        entityKey: " Product   Price ",
        isPrimary: false,
      },
      {
        metricType: "search_clicks",
        entityType: "url",
        entityKey: "https://WWW.Example.com/Pricing/?preview=1#top",
        isPrimary: true,
      },
      {
        metricType: "organic_sessions",
        entityType: "site",
        entityKey: "shop.example.com",
        isPrimary: false,
      },
      {
        metricType: "search_clicks",
        entityType: "url",
        entityKey: "example.com/Pricing/",
        isPrimary: true,
      },
    ];

    await GrowthMeasurementsService.startMeasurement(startInput({ metrics }));

    expect(
      startWrites[0]?.metrics.map(({ id: _id, ...metric }) => metric),
    ).toEqual([
      {
        metricType: "organic_sessions",
        entityType: "site",
        entityKey: "shop.example.com",
        isPrimary: false,
      },
      {
        metricType: "search_clicks",
        entityType: "url",
        entityKey: "https://example.com/Pricing",
        isPrimary: true,
      },
      {
        metricType: "search_impressions",
        entityType: "keyword",
        entityKey: "product price",
        isPrimary: false,
      },
    ]);
  });

  it("rejects canonical duplicates whose primary flags conflict", async () => {
    const { startWrites } = installStore();
    const metrics: GrowthMeasurementMetricInput[] = [
      defaultMetric,
      {
        ...defaultMetric,
        entityKey: "example.com/Pricing/",
        isPrimary: false,
      },
    ];

    await expect(
      GrowthMeasurementsService.startMeasurement(startInput({ metrics })),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(startWrites).toHaveLength(0);
  });

  it.each([
    ["wrong status", { status: "in_progress" as const }],
    ["stale version", { stateVersion: implementedVersion - 1 }],
    ["missing implementation time", { implementedAt: null }],
  ])("rejects an ineligible Action with %s", async (_label, override) => {
    const store = installStore();
    store.setAction(makeAction(override));

    await expect(
      GrowthMeasurementsService.startMeasurement(startInput()),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(store.startWrites).toHaveLength(0);
  });

  it("hides missing projects and Actions as NOT_FOUND", async () => {
    const store = installStore();
    store.setAction(null);

    await expect(
      GrowthMeasurementsService.startMeasurement(startInput()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      GrowthMeasurementsService.startMeasurement(
        startInput({ projectId: "project_2" }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.startWrites).toHaveLength(0);
  });

  it.each(["missing", "unlinked", "non-manual"])(
    "rejects a %s implementation Change Event without writing",
    async () => {
      const store = installStore();
      repository.getLinkedManualChangeEvent.mockResolvedValueOnce(null);

      await expect(
        GrowthMeasurementsService.startMeasurement(startInput()),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(store.startWrites).toHaveLength(0);
    },
  );

  it("rejects a future implementation Change Event without writing", async () => {
    const store = installStore();
    repository.getLinkedManualChangeEvent.mockResolvedValueOnce({
      id: "change_a",
      projectId,
      source: "manual",
      happenedAt: "2099-01-01T00:00:00.000Z",
    });

    await expect(
      GrowthMeasurementsService.startMeasurement(startInput()),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(store.startWrites).toHaveLength(0);
  });

  it("conflicts when an exact retry selects a different event at the same time", async () => {
    const store = installStore();
    await startPlan(store);

    await expect(
      GrowthMeasurementsService.startMeasurement(
        startInput({ implementationChangeEventId: "change_same_time" }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(store.startWrites).toHaveLength(1);
  });

  it("accepts exact reordered retries after the Action advances and rejects immutable drift", async () => {
    const store = installStore();
    const firstInput = startInput({
      metrics: [
        defaultMetric,
        {
          metricType: "search_impressions",
          entityType: "keyword",
          entityKey: "Pricing",
          isPrimary: false,
        },
      ],
    });
    const first = await GrowthMeasurementsService.startMeasurement(firstInput);
    const retry = await GrowthMeasurementsService.startMeasurement({
      ...firstInput,
      metrics: firstInput.metrics.toReversed(),
    });

    expect(retry.plan.id).toBe(first.plan.id);
    expect(store.startWrites).toHaveLength(1);

    const drifts: Partial<StartGrowthMeasurementInput>[] = [
      { baselineStart: "2026-08-02" },
      {
        metrics: [
          defaultMetric,
          {
            metricType: "search_ctr",
            entityType: "keyword",
            entityKey: "Pricing",
            isPrimary: false,
          },
        ],
      },
      { actorId: "another-agent" },
      { note: "Different start note" },
      { expectedActionVersion: implementedVersion + 1 },
    ];
    for (const drift of drifts) {
      await expect(
        GrowthMeasurementsService.startMeasurement({ ...firstInput, ...drift }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    }
    expect(store.startWrites).toHaveLength(1);
  });
});

describe("GrowthMeasurementsService observations", () => {
  it("accepts an exact Observation retry after the Plan closes but rejects coordinate drift", async () => {
    const store = installStore();
    const graph = await startPlan(store);
    const metric = graph.metrics[0];
    if (!metric) throw new Error("Expected primary Metric");
    const input = observationInput(graph, metric.id, "baseline");
    const first = await GrowthMeasurementsService.recordObservation(input);
    await GrowthMeasurementsService.finalizeMeasurement(
      finalizeInput(graph, { outcome: "not_measurable" }),
      { now: new Date("2026-11-02T12:00:00.000Z") },
    );

    const retry = await GrowthMeasurementsService.recordObservation({
      ...input,
      capturedAt: "2026-11-01T11:30:00.000Z",
    });

    expect(retry).toBe(first);
    expect(store.observationWrites).toHaveLength(1);
    await expect(
      GrowthMeasurementsService.recordObservation({ ...input, value: 11 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("requires the exact inclusive period dates and starts long-term on the next day", async () => {
    const store = installStore();
    const graph = await startPlan(store);
    const metric = graph.metrics[0];
    if (!metric) throw new Error("Expected primary Metric");

    await expect(
      GrowthMeasurementsService.recordObservation(
        observationInput(graph, metric.id, "long_term", {
          effectiveStart: graph.plan.measurementEnd,
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await GrowthMeasurementsService.recordObservation(
      observationInput(graph, metric.id, "baseline"),
    );
    await GrowthMeasurementsService.recordObservation(
      observationInput(graph, metric.id, "measurement"),
    );
    await GrowthMeasurementsService.recordObservation(
      observationInput(graph, metric.id, "long_term"),
    );

    expect(
      store.observationWrites.map(
        ({ periodType, effectiveStart, effectiveEnd }) => ({
          periodType,
          effectiveStart,
          effectiveEnd,
        }),
      ),
    ).toEqual([
      {
        periodType: "baseline",
        effectiveStart: "2026-08-01",
        effectiveEnd: "2026-08-30",
      },
      {
        periodType: "measurement",
        effectiveStart: "2026-09-03",
        effectiveEnd: "2026-09-30",
      },
      {
        periodType: "long_term",
        effectiveStart: "2026-10-01",
        effectiveEnd: "2026-10-31",
      },
    ]);
  });

  it("rejects long-term evidence when the Plan has no long-term window", async () => {
    const store = installStore();
    const graph = await startPlan(
      store,
      startInput({ longMeasurementEnd: null }),
    );
    const metric = graph.metrics[0];
    if (!metric) throw new Error("Expected primary Metric");

    await expect(
      GrowthMeasurementsService.recordObservation(
        observationInput(graph, metric.id, "long_term"),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(store.observationWrites).toHaveLength(0);
  });

  it("enforces count, ratio, and average-position scalar rules and normalizes negative zero", async () => {
    const store = installStore();
    const graph = await startPlan(
      store,
      startInput({
        metrics: [
          defaultMetric,
          {
            metricType: "search_ctr",
            entityType: "url",
            entityKey: defaultMetric.entityKey,
            isPrimary: false,
          },
          {
            metricType: "search_average_position",
            entityType: "keyword",
            entityKey: "pricing",
            isPrimary: false,
          },
        ],
      }),
    );
    const count = findMetric(graph, "search_clicks");
    const ratio = findMetric(graph, "search_ctr");
    const position = findMetric(graph, "search_average_position");

    const invalid: Array<[MetricRow, number]> = [
      [count, -1],
      [count, 1.5],
      [count, Number.MAX_SAFE_INTEGER + 1],
      [count, Number.POSITIVE_INFINITY],
      [ratio, -0.01],
      [ratio, 1.01],
      [position, 0],
      [position, -1],
    ];
    for (const [metric, value] of invalid) {
      await expect(
        GrowthMeasurementsService.recordObservation(
          observationInput(graph, metric.id, "baseline", { value }),
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }

    await GrowthMeasurementsService.recordObservation(
      observationInput(graph, count.id, "baseline", {
        value: -0,
        completeness: -0,
      }),
    );
    await GrowthMeasurementsService.recordObservation(
      observationInput(graph, ratio.id, "baseline", { value: 1 }),
    );
    await GrowthMeasurementsService.recordObservation(
      observationInput(graph, position.id, "baseline", { value: 0.5 }),
    );

    expect(store.observationWrites).toHaveLength(3);
    expect(store.observationWrites[0]).toMatchObject({
      value: 0,
      completeness: 0,
    });
  });

  it("hides foreign and missing Plan/Metric coordinates as NOT_FOUND", async () => {
    const store = installStore();
    const graph = await startPlan(store);
    const metric = graph.metrics[0];
    if (!metric) throw new Error("Expected primary Metric");
    const input = observationInput(graph, metric.id, "baseline");

    await expect(
      GrowthMeasurementsService.recordObservation({
        ...input,
        projectId: "project_2",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      GrowthMeasurementsService.recordObservation({
        ...input,
        measurementPlanId: "missing_plan",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      GrowthMeasurementsService.recordObservation({
        ...input,
        metricId: "missing_metric",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.observationWrites).toHaveLength(0);
  });
});

describe("GrowthMeasurementsService finalize", () => {
  it("uses the frozen report timezone for the inclusive due-date gate", async () => {
    const store = installStore();
    const graph = await startPlan(store);
    await recordPrimaryEvidence(graph);
    const input = finalizeInput(graph);

    await expect(
      GrowthMeasurementsService.finalizeMeasurement(input, {
        now: new Date("2026-10-31T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(store.finalizeWrites).toHaveLength(0);

    const result = await GrowthMeasurementsService.finalizeMeasurement(input, {
      now: new Date("2026-11-02T12:00:00.000Z"),
    });
    expect(result.plan.status).toBe("completed");
    expect(result.dueDate).toBe("2026-10-31");
    expect(store.finalizeWrites).toHaveLength(1);
  });

  it("requires baseline, primary, and configured long-term evidence for every primary Metric", async () => {
    const store = installStore();
    const graph = await startPlan(store);
    const metric = graph.metrics[0];
    if (!metric) throw new Error("Expected primary Metric");
    await GrowthMeasurementsService.recordObservation(
      observationInput(graph, metric.id, "baseline"),
    );
    await GrowthMeasurementsService.recordObservation(
      observationInput(graph, metric.id, "measurement"),
    );

    await expect(
      GrowthMeasurementsService.finalizeMeasurement(finalizeInput(graph), {
        now: new Date("2026-11-02T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(store.finalizeWrites).toHaveLength(0);

    await GrowthMeasurementsService.recordObservation(
      observationInput(graph, metric.id, "long_term"),
    );
    await expect(
      GrowthMeasurementsService.finalizeMeasurement(finalizeInput(graph), {
        now: new Date("2026-11-02T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ plan: { status: "completed" } });
  });

  it("allows not_measurable to close an incomplete Plan", async () => {
    const store = installStore();
    const graph = await startPlan(store);

    const result = await GrowthMeasurementsService.finalizeMeasurement(
      finalizeInput(graph, {
        outcome: "not_measurable",
        summary: "Provider evidence was unavailable for the complete window.",
      }),
      { now: new Date("2026-11-02T12:00:00.000Z") },
    );

    expect(result.result).toMatchObject({ outcome: "not_measurable" });
    expect(store.finalizeWrites[0]?.observations).toEqual([]);
  });

  it("deduplicates and sorts same-project confounders and hides foreign references", async () => {
    const store = installStore();
    const graph = await startPlan(store);
    await recordPrimaryEvidence(graph);

    const result = await GrowthMeasurementsService.finalizeMeasurement(
      finalizeInput(graph, {
        confoundingChangeEventIds: ["change_b", "change_b"],
      }),
      { now: new Date("2026-11-02T12:00:00.000Z") },
    );

    expect(result.confoundingChangeEventIds).toEqual(["change_b"]);
    expect(store.finalizeWrites[0]?.confoundingChangeEventIds).toEqual([
      "change_b",
    ]);

    const foreignStore = installStore();
    const foreignGraph = await startPlan(foreignStore);
    await recordPrimaryEvidence(foreignGraph);
    await expect(
      GrowthMeasurementsService.finalizeMeasurement(
        finalizeInput(foreignGraph, {
          confoundingChangeEventIds: ["foreign_change"],
        }),
        { now: new Date("2026-11-02T12:00:00.000Z") },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(foreignStore.finalizeWrites).toHaveLength(0);
  });

  it("rejects the implementation Change Event as its own confounder", async () => {
    const store = installStore();
    const graph = await startPlan(store);
    await recordPrimaryEvidence(graph);

    await expect(
      GrowthMeasurementsService.finalizeMeasurement(
        finalizeInput(graph, { confoundingChangeEventIds: ["change_a"] }),
        { now: new Date("2026-11-02T12:00:00.000Z") },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(store.finalizeWrites).toHaveLength(0);
  });

  it("accepts an exact historical Result retry and rejects fact, actor, confounder, or version drift", async () => {
    const store = installStore();
    const graph = await startPlan(store);
    await recordPrimaryEvidence(graph);
    const input = finalizeInput(graph, {
      confoundingChangeEventIds: ["change_b"],
    });
    const first = await GrowthMeasurementsService.finalizeMeasurement(input, {
      now: new Date("2026-11-02T12:00:00.000Z"),
    });
    const retry = await GrowthMeasurementsService.finalizeMeasurement(
      {
        ...input,
        confoundingChangeEventIds: input.confoundingChangeEventIds.toReversed(),
      },
      { now: new Date("2027-01-01T00:00:00.000Z") },
    );

    expect(retry.result?.id).toBe(first.result?.id);
    expect(store.finalizeWrites).toHaveLength(1);

    const drifts: Partial<FinalizeGrowthMeasurementInput>[] = [
      { outcome: "neutral" },
      { summary: "A different immutable interpretation." },
      { actorId: "another-agent" },
      { note: "Different finish note" },
      { confoundingChangeEventIds: [] },
      { expectedActionVersion: graph.plan.actionVersion + 1 },
    ];
    for (const drift of drifts) {
      await expect(
        GrowthMeasurementsService.finalizeMeasurement(
          { ...input, ...drift },
          { now: new Date("2027-01-01T00:00:00.000Z") },
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    }
    expect(store.finalizeWrites).toHaveLength(1);
  });

  it("retries once when a concurrent Observation changes the frozen set", async () => {
    const store = installStore();
    const graph = await startPlan(
      store,
      startInput({
        longMeasurementEnd: null,
        metrics: [
          defaultMetric,
          {
            metricType: "search_impressions",
            entityType: "url",
            entityKey: defaultMetric.entityKey,
            isPrimary: false,
          },
        ],
      }),
    );
    await recordPrimaryEvidence(graph);
    const secondary = findMetric(graph, "search_impressions");
    let attempts = 0;
    repository.finalizeMeasurementGraph.mockImplementation(
      async (write: FinalizeMeasurementGraphInput) => {
        store.finalizeWrites.push(write);
        attempts += 1;
        if (attempts === 1) {
          await store.insertObservation(
            graph,
            observationInput(graph, secondary.id, "baseline", { value: 100 }),
            "concurrent_observation",
          );
          return;
        }
        store.commitFinalization(write);
      },
    );

    const result = await GrowthMeasurementsService.finalizeMeasurement(
      finalizeInput(graph),
      { now: new Date("2026-10-02T12:00:00.000Z") },
    );

    expect(result.result?.observationsHash).toBe(
      store.finalizeWrites[1]?.observationsHash,
    );
    expect(store.finalizeWrites).toHaveLength(2);
    expect(store.finalizeWrites[0]?.observations).toHaveLength(2);
    expect(store.finalizeWrites[1]?.observations).toHaveLength(3);
    expect(store.finalizeWrites[0]?.observationsHash).not.toBe(
      store.finalizeWrites[1]?.observationsHash,
    );
  });

  it("stops after the single retry when the Observation set changes again", async () => {
    const store = installStore();
    const graph = await startPlan(
      store,
      startInput({
        longMeasurementEnd: null,
        metrics: [
          defaultMetric,
          {
            metricType: "search_impressions",
            entityType: "url",
            entityKey: defaultMetric.entityKey,
            isPrimary: false,
          },
        ],
      }),
    );
    await recordPrimaryEvidence(graph);
    const secondary = findMetric(graph, "search_impressions");
    repository.finalizeMeasurementGraph.mockImplementation(
      async (write: FinalizeMeasurementGraphInput) => {
        store.finalizeWrites.push(write);
        const period =
          store.finalizeWrites.length === 1 ? "baseline" : "measurement";
        await store.insertObservation(
          graph,
          observationInput(graph, secondary.id, period, {
            value: period === "baseline" ? 100 : 120,
          }),
          `concurrent_${period}`,
        );
      },
    );

    await expect(
      GrowthMeasurementsService.finalizeMeasurement(finalizeInput(graph), {
        now: new Date("2026-10-02T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(store.finalizeWrites).toHaveLength(2);
  });
});

describe("GrowthMeasurementsService read model", () => {
  it("derives absolute and percent deltas without inventing a percent for zero baselines", async () => {
    const store = installStore();
    const graph = await startPlan(
      store,
      startInput({
        metrics: [
          defaultMetric,
          {
            metricType: "search_ctr",
            entityType: "url",
            entityKey: defaultMetric.entityKey,
            isPrimary: false,
          },
        ],
      }),
    );
    const clicks = findMetric(graph, "search_clicks");
    const ctr = findMetric(graph, "search_ctr");
    for (const [period, value] of [
      ["baseline", 100],
      ["measurement", 125],
      ["long_term", 150],
    ] as const) {
      await GrowthMeasurementsService.recordObservation(
        observationInput(graph, clicks.id, period, { value }),
      );
    }
    for (const [period, value] of [
      ["baseline", 0],
      ["measurement", 0.2],
      ["long_term", 0.4],
    ] as const) {
      await GrowthMeasurementsService.recordObservation(
        observationInput(graph, ctr.id, period, { value }),
      );
    }

    const result = await GrowthMeasurementsService.getMeasurement(
      projectId,
      graph.plan.id,
    );
    const clickComparison = result.comparisons.find(
      ({ metricId }) => metricId === clicks.id,
    );
    const ctrComparison = result.comparisons.find(
      ({ metricId }) => metricId === ctr.id,
    );

    expect(clickComparison).toMatchObject({
      baselineValue: 100,
      currentValue: 125,
      absoluteDelta: 25,
      percentDelta: 25,
      longTermValue: 150,
      longTermAbsoluteDelta: 50,
      longTermPercentDelta: 50,
    });
    expect(ctrComparison).toMatchObject({
      baselineValue: 0,
      currentValue: 0.2,
      absoluteDelta: 0.2,
      percentDelta: null,
      longTermValue: 0.4,
      longTermAbsoluteDelta: 0.4,
      longTermPercentDelta: null,
    });
  });
});
