import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import {
  isLegalGrowthActionTransition,
  type CreateGrowthActionInput,
  type TransitionGrowthActionInput,
} from "@/types/schemas/growth-actions";
import { GrowthActionsRepository as repo } from "../repositories/GrowthActionsRepository";
import {
  normalizeGrowthTargets,
  type NormalizedGrowthTarget,
} from "./GrowthTargetNormalizer";

type ActionStatus = TransitionGrowthActionInput["status"];

const targetKey = (target: NormalizedGrowthTarget) =>
  `${target.targetType}:${target.targetValue}`;

function actionFact(
  input: CreateGrowthActionInput,
  source: { runId: string; category: string; priorityScore: number },
  dueAt: string,
  targets: NormalizedGrowthTarget[],
) {
  return {
    projectId: input.projectId,
    runId: source.runId,
    recommendationId: input.recommendationId,
    creationKey: input.creationKey,
    title: input.title,
    description: input.description,
    category: source.category,
    priorityScore: source.priorityScore,
    ownerUserId: null,
    dueAt,
    targets,
    creationEvent: {
      actionVersion: 0,
      eventType: "created",
      fromStatus: null,
      toStatus: "approved",
      actorType: input.actorType,
      actorId: input.actorId,
      note: input.note ?? null,
    },
  };
}

async function eventFactHash(input: {
  projectId: string;
  actionId: string;
  actionVersion: number;
  eventType: "created" | "status_changed";
  fromStatus: ActionStatus | null;
  toStatus: ActionStatus;
  actorType: CreateGrowthActionInput["actorType"];
  actorId: string;
  note: string | null;
}) {
  return sha256Hex(JSON.stringify(input));
}

function assertEvent(
  event: Awaited<ReturnType<typeof repo.getActionEvent>>,
  expected: {
    projectId: string;
    actionId: string;
    actionVersion: number;
    eventType: "created" | "status_changed";
    fromStatus: ActionStatus | null;
    toStatus: ActionStatus;
    actorType: CreateGrowthActionInput["actorType"];
    actorId: string;
    note: string | null;
    factHash: string;
  },
) {
  if (
    !event ||
    event.projectId !== expected.projectId ||
    event.actionId !== expected.actionId ||
    event.actionVersion !== expected.actionVersion ||
    event.eventType !== expected.eventType ||
    event.fromStatus !== expected.fromStatus ||
    event.toStatus !== expected.toStatus ||
    event.actorType !== expected.actorType ||
    event.actorId !== expected.actorId ||
    event.note !== expected.note ||
    event.factHash !== expected.factHash
  ) {
    throw new AppError(
      "CONFLICT",
      "Stored Growth Action event does not match its immutable fact",
    );
  }
  return event;
}

async function readCreationGraph(
  projectId: string,
  actionId: string,
  expected: {
    recommendationId: string;
    creationKey: string;
    factHash: string;
    title: string;
    description: string;
    category: string;
    priorityScore: number;
    dueAt: string;
    targets: NormalizedGrowthTarget[];
    actorType: CreateGrowthActionInput["actorType"];
    actorId: string;
    note: string | null;
    eventFactHash: string;
  },
) {
  const graph = await repo.getActionGraph(projectId, actionId);
  if (!graph) throw new AppError("NOT_FOUND", "Growth Action not found");
  const action = graph.action;
  if (
    action.projectId !== projectId ||
    action.id !== actionId ||
    action.recommendationId !== expected.recommendationId ||
    action.creationKey !== expected.creationKey ||
    action.factHash !== expected.factHash ||
    action.title !== expected.title ||
    action.description !== expected.description ||
    action.category !== expected.category ||
    action.priorityScore !== expected.priorityScore ||
    action.ownerUserId !== null ||
    action.dueAt !== expected.dueAt ||
    JSON.stringify(graph.targets) !== JSON.stringify(expected.targets)
  ) {
    throw new AppError(
      "CONFLICT",
      "Stored Growth Action graph does not match its immutable fact",
    );
  }
  assertEvent(graph.creationEvent, {
    projectId,
    actionId,
    actionVersion: 0,
    eventType: "created",
    fromStatus: null,
    toStatus: "approved",
    actorType: expected.actorType,
    actorId: expected.actorId,
    note: expected.note,
    factHash: expected.eventFactHash,
  });
  return graph;
}

async function createAction(input: CreateGrowthActionInput) {
  const [domain, source, sourceTargetRows] = await Promise.all([
    repo.projectDomain(input.projectId),
    repo.getRecommendationSource(input.projectId, input.recommendationId),
    repo.listRecommendationTargets(input.projectId, input.recommendationId),
  ]);
  if (!domain) throw new AppError("NOT_FOUND", "Growth project not found");
  if (!source)
    throw new AppError("NOT_FOUND", "Growth Recommendation not found");
  if (source.status !== "accepted")
    throw new AppError(
      "CONFLICT",
      "Growth Recommendation must be accepted before creating an Action",
    );
  if (!Number.isFinite(source.priorityScore) || source.priorityScore < 0)
    throw new AppError("CONFLICT", "Growth Recommendation priority is invalid");

  const normalizedTargets = normalizeGrowthTargets(domain, input.targets);
  const sourceTargets = normalizeGrowthTargets(
    domain,
    sourceTargetRows.map(({ targetType, targetValue }) => ({
      type: targetType,
      value: targetValue,
    })),
  );
  const sourceTargetKeys = new Set(sourceTargets.map(targetKey));
  if (
    normalizedTargets.some((target) => !sourceTargetKeys.has(targetKey(target)))
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Action targets must belong to the source Recommendation",
    );

  const dueAt = new Date(input.dueAt).toISOString();
  const factHash = await sha256Hex(
    JSON.stringify(actionFact(input, source, dueAt, normalizedTargets)),
  );
  const existing = await repo.getActionByKey(
    input.projectId,
    input.creationKey,
  );
  if (existing) {
    if (existing.factHash !== factHash)
      throw new AppError(
        "CONFLICT",
        "Growth Action creation key is occupied by a different immutable fact",
      );
    const creationEventFactHash = await eventFactHash({
      projectId: input.projectId,
      actionId: existing.id,
      actionVersion: 0,
      eventType: "created",
      fromStatus: null,
      toStatus: "approved",
      actorType: input.actorType,
      actorId: input.actorId,
      note: input.note ?? null,
    });
    return readCreationGraph(input.projectId, existing.id, {
      recommendationId: input.recommendationId,
      creationKey: input.creationKey,
      factHash,
      title: input.title,
      description: input.description,
      category: source.category,
      priorityScore: source.priorityScore,
      dueAt,
      targets: normalizedTargets,
      actorType: input.actorType,
      actorId: input.actorId,
      note: input.note ?? null,
      eventFactHash: creationEventFactHash,
    });
  }

  const actionId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const creationEventFactHash = await eventFactHash({
    projectId: input.projectId,
    actionId,
    actionVersion: 0,
    eventType: "created",
    fromStatus: null,
    toStatus: "approved",
    actorType: input.actorType,
    actorId: input.actorId,
    note: input.note ?? null,
  });
  await repo.createActionGraph({
    id: actionId,
    projectId: input.projectId,
    runId: source.runId,
    recommendationId: input.recommendationId,
    creationKey: input.creationKey,
    factHash,
    title: input.title,
    description: input.description,
    dueAt,
    category: source.category,
    priorityScore: source.priorityScore,
    targets: normalizedTargets,
    eventId,
    eventFactHash: creationEventFactHash,
    actorType: input.actorType,
    actorId: input.actorId,
    note: input.note ?? null,
  });

  const winner = await repo.getActionByKey(input.projectId, input.creationKey);
  if (!winner) throw new AppError("CONFLICT", "Growth Action was not created");
  if (winner.factHash !== factHash)
    throw new AppError(
      "CONFLICT",
      "Growth Action creation key is occupied by a different immutable fact",
    );
  const winnerEventFactHash = await eventFactHash({
    projectId: input.projectId,
    actionId: winner.id,
    actionVersion: 0,
    eventType: "created",
    fromStatus: null,
    toStatus: "approved",
    actorType: input.actorType,
    actorId: input.actorId,
    note: input.note ?? null,
  });
  return readCreationGraph(input.projectId, winner.id, {
    recommendationId: input.recommendationId,
    creationKey: input.creationKey,
    factHash,
    title: input.title,
    description: input.description,
    category: source.category,
    priorityScore: source.priorityScore,
    dueAt,
    targets: normalizedTargets,
    actorType: input.actorType,
    actorId: input.actorId,
    note: input.note ?? null,
    eventFactHash: winnerEventFactHash,
  });
}

async function transitionAction(input: TransitionGrowthActionInput) {
  const action = await repo.getAction(input.projectId, input.actionId);
  if (!action) throw new AppError("NOT_FOUND", "Growth Action not found");
  const note = input.note ?? null;
  const actionVersion = input.expectedVersion + 1;
  const factHash = await eventFactHash({
    projectId: input.projectId,
    actionId: input.actionId,
    actionVersion,
    eventType: "status_changed",
    fromStatus: input.expectedStatus,
    toStatus: input.status,
    actorType: input.actorType,
    actorId: input.actorId,
    note,
  });

  const expectedEvent = {
    projectId: input.projectId,
    actionId: input.actionId,
    actionVersion,
    eventType: "status_changed" as const,
    fromStatus: input.expectedStatus,
    toStatus: input.status,
    actorType: input.actorType,
    actorId: input.actorId,
    note,
    factHash,
  };
  const existingEvent = await repo.getActionEvent(
    input.projectId,
    input.actionId,
    actionVersion,
  );
  if (existingEvent) {
    const event = assertEvent(existingEvent, expectedEvent);
    if (action.stateVersion < actionVersion)
      throw new AppError(
        "CONFLICT",
        "Growth Action projection is behind its event history",
      );
    return { action, event };
  }

  if (
    action.status !== input.expectedStatus ||
    action.stateVersion !== input.expectedVersion ||
    !isLegalGrowthActionTransition(input.expectedStatus, input.status)
  ) {
    throw new AppError(
      "CONFLICT",
      "Growth Action transition is stale or illegal",
    );
  }

  await repo.transitionAction({
    projectId: input.projectId,
    actionId: input.actionId,
    expectedStatus: input.expectedStatus,
    expectedVersion: input.expectedVersion,
    status: input.status,
    eventId: crypto.randomUUID(),
    eventFactHash: factHash,
    actorType: input.actorType,
    actorId: input.actorId,
    note,
  });
  const [winner, event] = await Promise.all([
    repo.getAction(input.projectId, input.actionId),
    repo.getActionEvent(input.projectId, input.actionId, actionVersion),
  ]);
  if (!winner) throw new AppError("NOT_FOUND", "Growth Action not found");
  if (winner.stateVersion < actionVersion) {
    throw new AppError("CONFLICT", "Growth Action transition lost a race");
  }
  const winningEvent = assertEvent(event, expectedEvent);
  return { action: winner, event: winningEvent };
}

export const GrowthActionsService = {
  createAction,
  transitionAction,
  getAction: repo.getActionGraph,
} as const;
