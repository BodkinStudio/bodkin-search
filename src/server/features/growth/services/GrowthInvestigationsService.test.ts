import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";

const repositories = vi.hoisted(() => ({
  getSignal: vi.fn(),
  getRun: vi.fn(),
  findRecommendationForSignal: vi.fn(),
  getActionByKey: vi.fn(),
  getActionGraph: vi.fn(),
  getRecommendationSource: vi.fn(),
  listInvestigationWork: vi.fn(),
  listActionTargetsForActions: vi.fn(),
  listRecentActionEvents: vi.fn(),
}));
const services = vi.hoisted(() => ({
  getRecommendation: vi.fn(),
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
  status: "completed",
};
const graph = {
  recommendation: {
    id: "recommendation_1",
    status: "proposed" as const,
    reviewVersion: 0,
    title: "Investigate declining search clicks",
    rationale: "Cause is unknown.",
  },
  targets: [
    { targetType: "url" as const, targetValue: "https://example.com/pricing" },
  ],
  steps: [{ position: 0, content: "Review saved evidence." }],
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
  services.getRecommendation.mockResolvedValue(graph);
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
  services.transitionAction.mockResolvedValue({ action, event: {} });
});

describe("GrowthInvestigationsService", () => {
  it("reads only the saved, same-run template suggestion", async () => {
    repositories.getActionByKey.mockResolvedValue(null);
    await expect(
      GrowthInvestigationsService.getInvestigation("project_1", "signal_1"),
    ).resolves.toMatchObject({
      recommendationId: "recommendation_1",
      status: "proposed",
      displayUrls: ["https://example.com/pricing"],
      actionId: null,
    });
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
