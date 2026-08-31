import { AppError } from "@/server/lib/errors";
import type {
  GrowthInvestigationView,
  GrowthWorkItem,
  GrowthWorkOverview,
} from "@/types/schemas/growth-investigations";
import type {
  GrowthWorkHistory,
  UpdateGrowthWorkStatusInput,
} from "@/types/schemas/growth-work";
import { GrowthActionsRepository } from "../repositories/GrowthActionsRepository";
import { GrowthInsightsRepository } from "../repositories/GrowthInsightsRepository";
import { GrowthRunsRepository } from "../repositories/GrowthRunsRepository";
import { GrowthActionsService } from "./GrowthActionsService";
import { GrowthInsightsService } from "./GrowthInsightsService";
import {
  GROWTH_INVESTIGATION_TEMPLATE_VERSION,
  investigationKeys,
} from "./GrowthInvestigationTemplate";
import { growthEvidenceDisplayUrl } from "./GrowthEvidencePacket";
import { PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION } from "./PriorityPageClickDeclineDetector";

const RUN_TYPE = "manual_analysis" as const;
const CADENCE_SLOT_PREFIX = "priority-page-check:";
const WORK_LIMIT = 50;

function isSourceSignal(signal: {
  signalType: string;
  entityType: string;
  metric: string;
  evidenceKind: string;
}) {
  return (
    signal.signalType === "priority_page_click_decline" &&
    signal.entityType === "key_page" &&
    signal.metric === "gsc_clicks" &&
    signal.evidenceKind === "gsc_period"
  );
}

function sourceRun(run: {
  runType: string;
  cadenceSlot: string;
  detectorVersion: string;
  status: string;
}) {
  return (
    run.runType === RUN_TYPE &&
    run.cadenceSlot.startsWith(CADENCE_SLOT_PREFIX) &&
    run.detectorVersion === PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION &&
    ["completed", "completed_with_errors"].includes(run.status)
  );
}

function dueOn(dueAt: string | null) {
  return dueAt?.slice(0, 10) ?? null;
}

function displayUrls(targets: { targetType: string; targetValue: string }[]) {
  return targets
    .filter((target) => target.targetType === "url")
    .map(
      (target) => growthEvidenceDisplayUrl(target.targetValue).value ?? null,
    );
}

async function source(projectId: string, signalId: string) {
  const signal = await GrowthRunsRepository.getSignal(projectId, signalId);
  if (!signal || !isSourceSignal(signal))
    throw new AppError("NOT_FOUND", "Growth Signal not found");
  const run = await GrowthRunsRepository.getRun(projectId, signal.runId);
  if (!run || !sourceRun(run))
    throw new AppError("NOT_FOUND", "Growth investigation source not found");
  return { signal, run };
}

async function getSaved(projectId: string, signalId: string) {
  const { signal, run } = await source(projectId, signalId);
  const found = await GrowthInsightsRepository.findRecommendationForSignal(
    projectId,
    signalId,
    investigationKeys(signalId).recommendation,
  );
  if (!found || found.runId !== run.id) return null;
  const graph = await GrowthInsightsService.getRecommendation(
    projectId,
    run.id,
    found.id,
  );
  if (!graph) return null;
  return { signal, run, graph };
}

async function getInvestigation(
  projectId: string,
  signalId: string,
): Promise<GrowthInvestigationView | null> {
  const saved = await getSaved(projectId, signalId);
  if (!saved) return null;
  const action = await GrowthActionsRepository.getActionByKey(
    projectId,
    investigationKeys(signalId).action,
  );
  return {
    recommendationId: saved.graph.recommendation.id,
    title: saved.graph.recommendation.title,
    rationale: saved.graph.recommendation.rationale,
    steps: saved.graph.steps.map((step) => step.content),
    displayUrls: displayUrls(saved.graph.targets),
    status: saved.graph.recommendation.status,
    actionId: action?.id ?? null,
    dueOn: dueOn(action?.dueAt ?? null),
    templateVersion: GROWTH_INVESTIGATION_TEMPLATE_VERSION,
  };
}

function projectedWorkItem(
  action: {
    id: string;
    title: string;
    status: GrowthWorkItem["status"];
    stateVersion: number;
    dueAt: string;
    createdAt: string;
    runId: string;
  },
  targets: { targetType: string; targetValue: string }[],
): GrowthWorkItem {
  return {
    id: action.id,
    title: action.title,
    status: action.status,
    stateVersion: action.stateVersion,
    dueOn: dueOn(action.dueAt),
    createdAt: action.createdAt,
    runId: action.runId,
    displayUrls: displayUrls(targets),
  };
}

export async function getQualifiedWork(projectId: string, actionId: string) {
  const [action] = await GrowthActionsRepository.listInvestigationWork(
    projectId,
    1,
    actionId,
  );
  if (!action) throw new AppError("NOT_FOUND", "Growth Work item not found");
  return action;
}

async function updateWorkStatus(
  input: UpdateGrowthWorkStatusInput & { actorId: string },
) {
  const qualified = await getQualifiedWork(input.projectId, input.actionId);
  const transitioned = await GrowthActionsService.transitionAction({
    ...input,
    actorType: "user",
  });
  const targets = await GrowthActionsRepository.listActionTargetsForActions(
    input.projectId,
    [input.actionId],
  );
  return projectedWorkItem(
    { ...transitioned.action, runId: qualified.runId },
    targets,
  );
}

async function getWorkHistory(
  projectId: string,
  actionId: string,
): Promise<GrowthWorkHistory> {
  await getQualifiedWork(projectId, actionId);
  const events = await GrowthActionsRepository.listRecentActionEvents(
    projectId,
    actionId,
  );
  return {
    actionId,
    events: events.map((event) => ({
      version: event.actionVersion,
      eventType: event.eventType,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      recordedAt: event.createdAt,
    })),
    limit: WORK_LIMIT,
  };
}

async function approveInvestigation(input: {
  projectId: string;
  signalId: string;
  dueOn: string;
  actorId: string;
}) {
  const saved = await getSaved(input.projectId, input.signalId);
  if (!saved) throw new AppError("NOT_FOUND", "Growth investigation not found");
  const keys = investigationKeys(input.signalId);
  const actionInput = {
    projectId: input.projectId,
    recommendationId: saved.graph.recommendation.id,
    creationKey: keys.action,
    title: saved.graph.recommendation.title,
    description: saved.graph.recommendation.rationale,
    dueAt: `${input.dueOn}T00:00:00.000Z`,
    targets: saved.graph.targets.map(({ targetType, targetValue }) => ({
      type: targetType,
      value: targetValue,
    })),
    actorType: "user" as const,
    actorId: input.actorId,
  };

  const replay = async (existing: {
    id: string;
    recommendationId: string;
    dueAt: string;
  }) => {
    if (existing.recommendationId !== saved.graph.recommendation.id)
      throw new AppError(
        "CONFLICT",
        "Growth investigation action identity conflicts with its recommendation",
      );
    if (dueOn(existing.dueAt) !== input.dueOn)
      throw new AppError(
        "CONFLICT",
        "Growth investigation action already has a different due date",
      );
    const graph = await GrowthActionsRepository.getActionGraph(
      input.projectId,
      existing.id,
    );
    if (!graph?.creationEvent)
      throw new AppError(
        "CONFLICT",
        "Growth investigation approval history is incomplete",
      );
    // Validate the complete immutable graph with its original actor and note.
    // A later reviewer can read that approval but cannot rewrite its intent.
    const verified = await GrowthActionsService.createAction({
      ...actionInput,
      actorType: graph.creationEvent.actorType,
      actorId: graph.creationEvent.actorId,
      note: graph.creationEvent.note ?? undefined,
    });
    return projectedWorkItem(
      { ...verified.action, runId: saved.run.id },
      verified.targets,
    );
  };

  const existing = await GrowthActionsRepository.getActionByKey(
    input.projectId,
    keys.action,
  );
  if (existing) return replay(existing);
  if (saved.graph.recommendation.status === "accepted") {
    throw new AppError(
      "CONFLICT",
      "Growth investigation approval is incomplete and needs review; its original due date and actor were not recorded",
    );
  }
  if (saved.graph.recommendation.status !== "proposed") {
    throw new AppError(
      "CONFLICT",
      "Growth investigation is no longer available",
    );
  }

  try {
    const graph = await GrowthActionsService.approveProposedRecommendation(
      actionInput,
      saved.graph.recommendation.reviewVersion,
    );
    return projectedWorkItem(
      { ...graph.action, runId: saved.run.id },
      graph.targets,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFLICT") {
      const winner = await GrowthActionsRepository.getActionByKey(
        input.projectId,
        keys.action,
      );
      if (winner) return replay(winner);
    }
    throw error;
  }
}

async function getWork(projectId: string): Promise<GrowthWorkOverview> {
  const actions = await GrowthActionsRepository.listInvestigationWork(
    projectId,
    WORK_LIMIT,
  );
  const targets = await GrowthActionsRepository.listActionTargetsForActions(
    projectId,
    actions.map((action) => action.id),
  );
  const targetsByAction = new Map<string, typeof targets>();
  for (const target of targets) {
    const current = targetsByAction.get(target.actionId) ?? [];
    current.push(target);
    targetsByAction.set(target.actionId, current);
  }
  return {
    actions: actions.map((action) =>
      projectedWorkItem(action, targetsByAction.get(action.id) ?? []),
    ),
    limit: WORK_LIMIT,
  };
}

export const GrowthInvestigationsService = {
  getInvestigation,
  approveInvestigation,
  getWork,
  updateWorkStatus,
  getWorkHistory,
  getQualifiedWork,
} as const;
