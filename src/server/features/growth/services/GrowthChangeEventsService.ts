import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type {
  LinkGrowthActionChangeInput,
  RecordManualGrowthChangeEventInput,
} from "@/types/schemas/growth-change-events";
import { GrowthChangeEventsRepository as repo } from "../repositories/GrowthChangeEventsRepository";
import {
  canonicalizeGrowthExactUrls,
  normalizeGrowthExactUrls,
} from "./GrowthTargetNormalizer";

const MANUAL_SOURCE = "manual" as const;

function changeEventFact(
  input: RecordManualGrowthChangeEventInput,
  happenedAt: string,
  urls: string[],
) {
  return {
    projectId: input.projectId,
    creationKey: input.creationKey,
    source: MANUAL_SOURCE,
    changeType: input.changeType,
    actorType: input.actorType,
    actorId: input.actorId,
    description: input.description,
    happenedAt,
    externalRef: input.externalRef ?? null,
    urls,
  };
}

async function readCompleteGraph(
  projectId: string,
  eventId: string,
  expected: ReturnType<typeof changeEventFact> & { factHash: string },
) {
  const graph = await repo.getChangeEventGraph(projectId, eventId);
  if (!graph) throw new AppError("NOT_FOUND", "Growth Change Event not found");
  const event = graph.event;
  if (
    event.id !== eventId ||
    event.projectId !== expected.projectId ||
    event.creationKey !== expected.creationKey ||
    event.factHash !== expected.factHash ||
    event.source !== expected.source ||
    event.changeType !== expected.changeType ||
    event.actorType !== expected.actorType ||
    event.actorId !== expected.actorId ||
    event.description !== expected.description ||
    event.happenedAt !== expected.happenedAt ||
    event.externalRef !== expected.externalRef ||
    JSON.stringify(graph.urls) !== JSON.stringify(expected.urls)
  ) {
    throw new AppError(
      "CONFLICT",
      "Stored Growth Change Event graph does not match its immutable fact",
    );
  }
  return graph;
}

async function recordManualEvent(input: RecordManualGrowthChangeEventInput) {
  const domain = await repo.projectDomain(input.projectId);
  if (!domain) throw new AppError("NOT_FOUND", "Growth project not found");

  const happenedAt = new Date(input.happenedAt).toISOString();
  const urls = canonicalizeGrowthExactUrls(input.urls);
  const fact = changeEventFact(input, happenedAt, urls);
  const factHash = await sha256Hex(JSON.stringify(fact));
  const existing = await repo.getChangeEventByKey(
    input.projectId,
    input.creationKey,
  );
  if (existing) {
    if (existing.factHash !== factHash)
      throw new AppError(
        "CONFLICT",
        "Growth Change Event creation key is occupied by a different immutable fact",
      );
    return readCompleteGraph(input.projectId, existing.id, {
      ...fact,
      factHash,
    });
  }

  normalizeGrowthExactUrls(domain, urls);

  await repo.createChangeEventGraph({
    id: crypto.randomUUID(),
    ...fact,
    factHash,
    expectedDomain: domain,
  });

  const winner = await repo.getChangeEventByKey(
    input.projectId,
    input.creationKey,
  );
  if (!winner)
    throw new AppError("CONFLICT", "Growth Change Event was not created");
  if (winner.factHash !== factHash)
    throw new AppError(
      "CONFLICT",
      "Growth Change Event creation key is occupied by a different immutable fact",
    );
  return readCompleteGraph(input.projectId, winner.id, {
    ...fact,
    factHash,
  });
}

async function getChangeEvent(projectId: string, eventId: string) {
  const graph = await repo.getChangeEventGraph(projectId, eventId);
  if (!graph) throw new AppError("NOT_FOUND", "Growth Change Event not found");
  return graph;
}

async function linkAction(input: LinkGrowthActionChangeInput) {
  const [event, action] = await Promise.all([
    repo.getChangeEvent(input.projectId, input.changeEventId),
    repo.getAction(input.projectId, input.actionId),
  ]);
  if (!event || !action)
    throw new AppError("NOT_FOUND", "Growth Change Event or Action not found");

  await repo.linkActionChange(input);
  const link = await repo.getActionChange(
    input.projectId,
    input.changeEventId,
    input.actionId,
  );
  if (!link)
    throw new AppError("NOT_FOUND", "Growth Change Event or Action not found");
  return link;
}

export const GrowthChangeEventsService = {
  recordManualEvent,
  getChangeEvent,
  linkAction,
} as const;
