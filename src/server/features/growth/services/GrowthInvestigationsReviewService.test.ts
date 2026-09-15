vi.mock("./GrowthAssessmentsService", () => ({
  GrowthAssessmentsService: { requireReadyForPage: vi.fn() },
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";

const repositories = vi.hoisted(() => ({
  getSignal: vi.fn(),
  getRun: vi.fn(),
  findRecommendationForSignal: vi.fn(),
  getDecisionControllerSource: vi.fn(),
  getApprovedAiBriefAction: vi.fn().mockResolvedValue(null),
  getActionByKey: vi.fn(),
}));
const insights = vi.hoisted(() => ({
  getRecommendation: vi.fn(),
  getInsight: vi.fn(),
  reviewRecommendation: vi.fn(),
}));
const actions = vi.hoisted(() => ({
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
    getApprovedAiBriefAction: repositories.getApprovedAiBriefAction,
    getActionByKey: repositories.getActionByKey,
  },
}));
vi.mock("./GrowthInsightsService", () => ({ GrowthInsightsService: insights }));
vi.mock("./GrowthActionsService", () => ({ GrowthActionsService: actions }));

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
const proposed = {
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
    runId: "must_not_escape",
    factHash: "must_not_escape",
    resolutionRecommendationId: null,
    reviewedAt: null,
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

beforeEach(() => {
  vi.resetAllMocks();
  repositories.getSignal.mockResolvedValue(signal);
  repositories.getRun.mockResolvedValue(run);
  repositories.findRecommendationForSignal.mockResolvedValue({
    id: "recommendation_1",
    runId: "run_1",
  });
  repositories.getDecisionControllerSource.mockResolvedValue(null);
  repositories.getActionByKey.mockResolvedValue(null);
  insights.getRecommendation.mockResolvedValue(proposed);
  insights.getInsight.mockResolvedValue(insightGraph);
  insights.reviewRecommendation.mockResolvedValue(proposed.recommendation);
});

describe("GrowthInvestigationsService review", () => {
  it("projects only the strict safe investigation view", async () => {
    await expect(
      GrowthInvestigationsService.getInvestigation("project_1", "signal_1"),
    ).resolves.toEqual({
      relationship: "controller",
      recommendationId: "recommendation_1",
      title: "Investigate declining search clicks",
      rationale: "Cause is unknown.",
      steps: ["Review saved evidence."],
      displayUrls: ["https://example.com/pricing"],
      status: "proposed",
      reviewVersion: 0,
      dismissalReason: null,
      snoozedUntil: null,
      actionId: null,
      dueOn: null,
      templateVersion: "priority-page-investigation-v1",
    });
  });

  it("rejects review through a suppressed Signal identity", async () => {
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
      GrowthInvestigationsService.reviewInvestigation({
        projectId: "project_1",
        signalId: "signal_1",
        expectedVersion: 0,
        decision: "dismiss",
        dismissalReason: "duplicate",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(insights.reviewRecommendation).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "dismisses a proposed investigation",
      input: {
        decision: "dismiss" as const,
        dismissalReason: "already_planned" as const,
      },
      initial: proposed,
      reviewed: {
        ...proposed,
        recommendation: {
          ...proposed.recommendation,
          status: "dismissed" as const,
          reviewVersion: 1,
          dismissalReason: "already_planned",
        },
      },
      expected: {
        expectedStatus: "proposed",
        status: "dismissed",
        dismissalReason: "already_planned",
      },
    },
    {
      label: "snoozes a proposed investigation at UTC start of day",
      input: {
        decision: "snooze" as const,
        snoozeUntil: "2099-09-04",
      },
      initial: proposed,
      reviewed: {
        ...proposed,
        recommendation: {
          ...proposed.recommendation,
          status: "snoozed" as const,
          reviewVersion: 1,
          snoozedUntil: "2099-09-04T00:00:00.000Z",
        },
      },
      expected: {
        expectedStatus: "proposed",
        status: "snoozed",
        snoozedUntil: "2099-09-04T00:00:00.000Z",
      },
    },
    {
      label: "returns a snoozed investigation to review now",
      input: { decision: "review_now" as const },
      initial: {
        ...proposed,
        recommendation: {
          ...proposed.recommendation,
          status: "snoozed" as const,
          reviewVersion: 1,
          snoozedUntil: "2099-09-04T00:00:00.000Z",
        },
      },
      reviewed: {
        ...proposed,
        recommendation: { ...proposed.recommendation, reviewVersion: 2 },
      },
      expected: { expectedStatus: "snoozed", status: "proposed" },
    },
  ])("$label", async ({ input, initial, reviewed, expected }) => {
    insights.getRecommendation
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(reviewed);

    await expect(
      GrowthInvestigationsService.reviewInvestigation({
        projectId: "project_1",
        signalId: "signal_1",
        expectedVersion: initial.recommendation.reviewVersion,
        ...input,
      }),
    ).resolves.toMatchObject({
      status: reviewed.recommendation.status,
      reviewVersion: reviewed.recommendation.reviewVersion,
    });
    expect(insights.reviewRecommendation).toHaveBeenCalledWith({
      projectId: "project_1",
      recommendationId: "recommendation_1",
      expectedVersion: initial.recommendation.reviewVersion,
      ...expected,
    });
    expect(actions.approveProposedRecommendation).not.toHaveBeenCalled();
    expect(actions.createAction).not.toHaveBeenCalled();
  });

  it("qualifies the same-project saved investigation before review", async () => {
    repositories.getSignal.mockResolvedValue(null);
    await expect(
      GrowthInvestigationsService.reviewInvestigation({
        projectId: "project_foreign",
        signalId: "signal_1",
        expectedVersion: 0,
        decision: "dismiss",
        dismissalReason: "irrelevant",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repositories.getSignal).toHaveBeenCalledWith(
      "project_foreign",
      "signal_1",
    );
    expect(insights.reviewRecommendation).not.toHaveBeenCalled();
  });

  it("delegates exact replay and stale or illegal conflicts without work", async () => {
    const dismissed = {
      ...proposed,
      recommendation: {
        ...proposed.recommendation,
        status: "dismissed" as const,
        reviewVersion: 1,
        dismissalReason: "duplicate",
      },
    };
    insights.getRecommendation.mockResolvedValue(dismissed);
    await expect(
      GrowthInvestigationsService.reviewInvestigation({
        projectId: "project_1",
        signalId: "signal_1",
        expectedVersion: 0,
        decision: "dismiss",
        dismissalReason: "duplicate",
      }),
    ).resolves.toMatchObject({ status: "dismissed", reviewVersion: 1 });

    for (const code of ["CONFLICT", "VALIDATION_ERROR"] as const) {
      insights.reviewRecommendation.mockRejectedValueOnce(new AppError(code));
      await expect(
        GrowthInvestigationsService.reviewInvestigation({
          projectId: "project_1",
          signalId: "signal_1",
          expectedVersion: 0,
          decision: "dismiss",
          dismissalReason: "duplicate",
        }),
      ).rejects.toMatchObject({ code });
    }
    expect(actions.approveProposedRecommendation).not.toHaveBeenCalled();
    expect(actions.createAction).not.toHaveBeenCalled();
  });
});
