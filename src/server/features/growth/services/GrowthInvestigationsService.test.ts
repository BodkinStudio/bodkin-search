/* eslint-disable max-lines -- one shared fixture keeps controller and suppressed projections auditable together */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";

const repositories = vi.hoisted(() => ({
  getSignal: vi.fn(),
  getRun: vi.fn(),
  findRecommendationForSignal: vi.fn(),
  getDecisionControllerSource: vi.fn(),
  getActionByKey: vi.fn(),
  getActionGraph: vi.fn(),
  getRecommendationSource: vi.fn(),
  listInvestigationWork: vi.fn(),
  listActionTargetsForActions: vi.fn(),
  listRecentActionEvents: vi.fn(),
}));
const services = vi.hoisted(() => ({
  getRecommendation: vi.fn(),
  getInsight: vi.fn(),
  reviewRecommendation: vi.fn(),
  createAction: vi.fn(),
  approveProposedRecommendation: vi.fn(),
  transitionAction: vi.fn(),
}));

vi.mock("../repositories/GrowthRunsRepository", () => ({
  GrowthRunsRepository: {
    getSignal: repositories.getSignal,
    getRun: repositories.getRun,
  },
}));
vi.mock("../repositories/GrowthInsightsRepository", () => ({
  GrowthInsightsRepository: {
    findRecommendationForSignal: repositories.findRecommendationForSignal,
  },
}));
vi.mock("../repositories/GrowthOpportunityDecisionsRepository", () => ({
  GrowthOpportunityDecisionsRepository: {
    getDecisionControllerSource: repositories.getDecisionControllerSource,
  },
}));
vi.mock("../repositories/GrowthActionsRepository", () => ({
  GrowthActionsRepository: {
    getActionByKey: repositories.getActionByKey,
    getActionGraph: repositories.getActionGraph,
    getRecommendationSource: repositories.getRecommendationSource,
    listInvestigationWork: repositories.listInvestigationWork,
    listActionTargetsForActions: repositories.listActionTargetsForActions,
    listRecentActionEvents: repositories.listRecentActionEvents,
  },
}));
vi.mock("./GrowthInsightsService", () => ({
  GrowthInsightsService: {
    getRecommendation: services.getRecommendation,
    getInsight: services.getInsight,
    reviewRecommendation: services.reviewRecommendation,
  },
}));
vi.mock("./GrowthActionsService", () => ({
  GrowthActionsService: {
    createAction: services.createAction,
    approveProposedRecommendation: services.approveProposedRecommendation,
    transitionAction: services.transitionAction,
  },
}));

import { GrowthInvestigationsService } from "./GrowthInvestigationsService";

const signal = {
  id: "signal_1",
  runId: "run_1",
  signalType: "priority_page_click_decline",
  entityType: "key_page",
  metric: "gsc_clicks",
  evidenceKind: "gsc_period",
};
const run = {
  id: "run_1",
  runType: "manual_analysis",
  cadenceSlot: "priority-page-check:one",
  detectorVersion: "priority-page-click-decline-v1",
  analysisVersion: "priority-page-investigation-v1",
  status: "completed",
};
const graph = {
  recommendation: {
    id: "recommendation_1",
    status: "proposed" as const,
    reviewVersion: 0,
    dismissalReason: null,
    snoozedUntil: null,
    title: "Investigate declining search clicks",
    rationale: "Cause is unknown.",
    creationKey: "priority-page-investigation-v1:recommendation:signal_1",
    category: "investigation",
  },
  insightIds: ["insight_1"],
  targets: [
    { targetType: "url" as const, targetValue: "https://example.com/pricing" },
  ],
  steps: [{ position: 0, content: "Review saved evidence." }],
};
const insightGraph = {
  insight: {
    id: "insight_1",
    creationKey: "priority-page-investigation-v1:insight:signal_1",
  },
  signalIds: ["signal_1"],
};
const action = {
  id: "action_1",
  recommendationId: "recommendation_1",
  runId: "run_1",
  title: graph.recommendation.title,
  status: "approved" as const,
  dueAt: "2026-09-01T00:00:00.000Z",
  createdAt: "2026-08-30T10:00:00.000Z",
  stateVersion: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  repositories.getSignal.mockResolvedValue(signal);
  repositories.getRun.mockResolvedValue(run);
  repositories.findRecommendationForSignal.mockResolvedValue({
    id: "recommendation_1",
    runId: "run_1",
  });
  repositories.getDecisionControllerSource.mockResolvedValue(null);
  services.getRecommendation.mockResolvedValue(graph);
  services.getInsight.mockResolvedValue(insightGraph);
  repositories.getRecommendationSource.mockResolvedValue({ runId: "run_1" });
  repositories.getActionGraph.mockResolvedValue({
    action,
    targets: graph.targets,
    creationEvent: {
      actorType: "user",
      actorId: "original_user",
      note: "Original approval",
    },
  });
  services.createAction.mockResolvedValue({ action, targets: graph.targets });
  services.approveProposedRecommendation.mockResolvedValue({
    action,
    targets: graph.targets,
  });
  services.reviewRecommendation.mockResolvedValue(graph.recommendation);
  services.transitionAction.mockResolvedValue({ action, event: {} });
});

// The cases intentionally share strict graph mocks so projection and mutation
// authorization cannot drift between controller and suppressed identities.
// eslint-disable-next-line max-lines-per-function
describe("GrowthInvestigationsService", () => {
  it.each([
    ["v1", "priority-page-click-decline-v1"],
    ["v2", "priority-page-click-decline-v2"],
  ])(
    "reads only the saved, same-run template suggestion for a persisted %s run",
    async (_label, detectorVersion) => {
      repositories.getRun.mockResolvedValue({ ...run, detectorVersion });
      repositories.getActionByKey.mockResolvedValue(null);
      await expect(
        GrowthInvestigationsService.getInvestigation("project_1", "signal_1"),
      ).resolves.toMatchObject({
        relationship: "controller",
        recommendationId: "recommendation_1",
        status: "proposed",
        displayUrls: ["https://example.com/pricing"],
        actionId: null,
        reviewVersion: 0,
        dismissalReason: null,
        snoozedUntil: null,
      });
    },
  );

  it("rejects an unsupported persisted detector version before graph reads", async () => {
    repositories.getRun.mockResolvedValue({
      ...run,
      detectorVersion: "priority-page-click-decline-v3",
    });
    await expect(
      GrowthInvestigationsService.getInvestigation("project_1", "signal_1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repositories.getDecisionControllerSource).not.toHaveBeenCalled();
    expect(repositories.findRecommendationForSignal).not.toHaveBeenCalled();
  });

  it("projects a repeated Signal through its controller without old evidence", async () => {
    const controllerSignal = {
      ...signal,
      id: "signal_controller",
      runId: "run_controller",
    };
    const controllerRun = { ...run, id: "run_controller" };
    repositories.getSignal.mockImplementation(async (_projectId, signalId) =>
      signalId === controllerSignal.id ? controllerSignal : signal,
    );
    repositories.getRun.mockImplementation(async (_projectId, runId) =>
      runId === controllerRun.id ? controllerRun : run,
    );
    repositories.getDecisionControllerSource.mockResolvedValue({
      relationship: "suppressed",
      recommendationId: "recommendation_1",
      controllerRunId: controllerRun.id,
      controllerSignalId: controllerSignal.id,
      suppressionReason: "existing_action",
      policyVersion: "priority-page-repeat-suppression-v1",
      controllerReleasedAt: null,
    });
    services.getRecommendation.mockResolvedValue({
      ...graph,
      recommendation: {
        ...graph.recommendation,
        creationKey:
          "priority-page-investigation-v1:recommendation:signal_controller",
      },
    });
    services.getInsight.mockResolvedValue({
      insight: {
        ...insightGraph.insight,
        creationKey: "priority-page-investigation-v1:insight:signal_controller",
      },
      signalIds: [controllerSignal.id],
    });
    repositories.getActionByKey.mockResolvedValue(action);

    await expect(
      GrowthInvestigationsService.getInvestigation("project_1", "signal_1"),
    ).resolves.toEqual({
      relationship: "suppressed",
      recommendationId: "recommendation_1",
      title: "Investigate declining search clicks",
      status: "proposed",
      suppressionReason: "existing_action",
      policyVersion: "priority-page-repeat-suppression-v1",
      actionId: "action_1",
      dueOn: "2026-09-01",
    });
    expect(repositories.getActionByKey).toHaveBeenCalledWith(
      "project_1",
      "priority-page-investigation-v1:action:signal_controller",
    );
  });

  it("rejects approval through a suppressed Signal identity", async () => {
    repositories.getDecisionControllerSource.mockResolvedValue({
      relationship: "suppressed",
      recommendationId: "recommendation_1",
      controllerRunId: "run_1",
      controllerSignalId: "signal_1",
      suppressionReason: "existing_proposal",
      policyVersion: "priority-page-repeat-suppression-v1",
      controllerReleasedAt: null,
    });
    await expect(
      GrowthInvestigationsService.approveInvestigation({
        projectId: "project_1",
        signalId: "signal_1",
        dueOn: "2026-09-01",
        actorId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(services.approveProposedRecommendation).not.toHaveBeenCalled();
  });

  it("returns an identical existing action without changing its actor or due date", async () => {
    repositories.getActionByKey.mockResolvedValue(action);
    await expect(
      GrowthInvestigationsService.approveInvestigation({
        projectId: "project_1",
        signalId: "signal_1",
        dueOn: "2026-09-01",
        actorId: "another_user",
      }),
    ).resolves.toMatchObject({ id: "action_1", dueOn: "2026-09-01" });
    expect(services.reviewRecommendation).not.toHaveBeenCalled();
    expect(services.approveProposedRecommendation).not.toHaveBeenCalled();
    expect(services.createAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "user",
        actorId: "original_user",
        note: "Original approval",
        dueAt: "2026-09-01T00:00:00.000Z",
      }),
    );
  });

  it("rejects a changed due date or mismatched recommendation under a stable action key", async () => {
    repositories.getActionByKey.mockResolvedValue(action);
    await expect(
      GrowthInvestigationsService.approveInvestigation({
        projectId: "project_1",
        signalId: "signal_1",
        dueOn: "2026-10-01",
        actorId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    repositories.getActionByKey.mockResolvedValue({
      ...action,
      recommendationId: "different_recommendation",
    });
    await expect(
      GrowthInvestigationsService.approveInvestigation({
        projectId: "project_1",
        signalId: "signal_1",
        dueOn: "2026-09-01",
        actorId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("atomically approves a stable action from server-derived facts", async () => {
    repositories.getActionByKey.mockResolvedValue(null);
    await GrowthInvestigationsService.approveInvestigation({
      projectId: "project_1",
      signalId: "signal_1",
      dueOn: "2026-09-01",
      actorId: "user_1",
    });
    expect(services.reviewRecommendation).not.toHaveBeenCalled();
    expect(services.createAction).not.toHaveBeenCalled();
    expect(services.approveProposedRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        creationKey: "priority-page-investigation-v1:action:signal_1",
        dueAt: "2026-09-01T00:00:00.000Z",
        actorId: "user_1",
        targets: graph.targets.map(({ targetType, targetValue }) => ({
          type: targetType,
          value: targetValue,
        })),
      }),
      0,
    );
  });

  it("rejects a legacy accepted recommendation without a saved action", async () => {
    repositories.getActionByKey.mockResolvedValue(null);
    services.getRecommendation.mockResolvedValue({
      ...graph,
      recommendation: { ...graph.recommendation, status: "accepted" as const },
    });
    await expect(
      GrowthInvestigationsService.approveInvestigation({
        projectId: "project_1",
        signalId: "signal_1",
        dueOn: "2026-09-01",
        actorId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(services.reviewRecommendation).not.toHaveBeenCalled();
    expect(services.createAction).not.toHaveBeenCalled();
    expect(services.approveProposedRecommendation).not.toHaveBeenCalled();
  });

  it("re-reads and validates the saved winner after a concurrent approval conflict", async () => {
    repositories.getActionByKey
      .mockResolvedValueOnce(null)
      .mockResolvedValue(action);
    services.approveProposedRecommendation.mockRejectedValue(
      new AppError("CONFLICT"),
    );
    await expect(
      GrowthInvestigationsService.approveInvestigation({
        projectId: "project_1",
        signalId: "signal_1",
        dueOn: "2026-09-01",
        actorId: "retry_user",
      }),
    ).resolves.toMatchObject({ id: "action_1" });
    expect(services.createAction).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "original_user" }),
    );
  });

  it("does not report a saved approval when its creation event is missing", async () => {
    repositories.getActionByKey.mockResolvedValue(action);
    repositories.getActionGraph.mockResolvedValue({
      action,
      targets: graph.targets,
      creationEvent: null,
    });
    await expect(
      GrowthInvestigationsService.approveInvestigation({
        projectId: "project_1",
        signalId: "signal_1",
        dueOn: "2026-09-01",
        actorId: "retry_user",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(services.createAction).not.toHaveBeenCalled();
    expect(services.approveProposedRecommendation).not.toHaveBeenCalled();
  });

  it("lists only projected investigation work with one bulk target read", async () => {
    repositories.listInvestigationWork.mockResolvedValue([action]);
    repositories.listActionTargetsForActions.mockResolvedValue([
      { actionId: "action_1", ...graph.targets[0] },
    ]);
    await expect(
      GrowthInvestigationsService.getWork("project_1"),
    ).resolves.toEqual({
      actions: [
        expect.objectContaining({
          id: "action_1",
          runId: "run_1",
          displayUrls: ["https://example.com/pricing"],
        }),
      ],
      limit: 50,
    });
    expect(repositories.listActionTargetsForActions).toHaveBeenCalledWith(
      "project_1",
      ["action_1"],
    );
    expect(repositories.getActionGraph).not.toHaveBeenCalled();
  });

  it("requires an exact qualified Action before changing its status", async () => {
    repositories.listInvestigationWork.mockResolvedValue([]);
    await expect(
      GrowthInvestigationsService.updateWorkStatus({
        projectId: "project_1",
        actionId: "foreign_action",
        expectedStatus: "approved",
        expectedVersion: 0,
        status: "ready",
        actorId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repositories.listInvestigationWork).toHaveBeenCalledWith(
      "project_1",
      1,
      "foreign_action",
    );
    expect(services.transitionAction).not.toHaveBeenCalled();
  });

  it("derives a user transition and projects the persisted winner", async () => {
    repositories.listInvestigationWork.mockResolvedValue([action]);
    repositories.listActionTargetsForActions.mockResolvedValue([
      { actionId: "action_1", ...graph.targets[0] },
    ]);
    services.transitionAction.mockResolvedValue({
      action: { ...action, status: "ready", stateVersion: 1 },
      event: {},
    });
    await expect(
      GrowthInvestigationsService.updateWorkStatus({
        projectId: "project_1",
        actionId: "action_1",
        expectedStatus: "approved",
        expectedVersion: 0,
        status: "ready",
        note: "  Ready to deliver  ",
        actorId: "user_authorized",
      }),
    ).resolves.toMatchObject({ status: "ready", stateVersion: 1 });
    expect(services.transitionAction).toHaveBeenCalledWith({
      projectId: "project_1",
      actionId: "action_1",
      expectedStatus: "approved",
      expectedVersion: 0,
      status: "ready",
      note: "  Ready to deliver  ",
      actorId: "user_authorized",
      actorType: "user",
    });
  });

  it("returns only the latest safe history fields in descending order", async () => {
    repositories.listInvestigationWork.mockResolvedValue([action]);
    repositories.listRecentActionEvents.mockResolvedValue([
      {
        actionVersion: 2,
        eventType: "status_changed",
        fromStatus: "ready",
        toStatus: "in_progress",
        note: "Started",
        createdAt: "2026-08-31T10:00:00.000Z",
        actorId: "must_not_escape",
        factHash: "must_not_escape",
      },
      {
        actionVersion: 0,
        eventType: "created",
        fromStatus: null,
        toStatus: "approved",
        note: null,
        createdAt: "2026-08-30T10:00:00.000Z",
      },
    ]);
    await expect(
      GrowthInvestigationsService.getWorkHistory("project_1", "action_1"),
    ).resolves.toEqual({
      actionId: "action_1",
      limit: 50,
      events: [
        {
          version: 2,
          eventType: "status_changed",
          fromStatus: "ready",
          toStatus: "in_progress",
          note: "Started",
          recordedAt: "2026-08-31T10:00:00.000Z",
        },
        {
          version: 0,
          eventType: "created",
          fromStatus: null,
          toStatus: "approved",
          note: null,
          recordedAt: "2026-08-30T10:00:00.000Z",
        },
      ],
    });
    expect(repositories.listRecentActionEvents).toHaveBeenCalledWith(
      "project_1",
      "action_1",
    );
  });
});
