import { AppError } from "@/server/lib/errors";
import type {
  GrowthWorkChangeLink,
  GrowthWorkChangesOverview,
  LinkGrowthWorkChangeInput,
} from "@/types/schemas/growth-work";
import { GrowthChangeEventsRepository as repo } from "../repositories/GrowthChangeEventsRepository";
import { toChangeDto } from "./GrowthChangeLogService";
import { GrowthChangeEventsService } from "./GrowthChangeEventsService";
import { getQualifiedWork } from "./GrowthInvestigationsService";

const LIMIT = 50;

async function getGrowthWorkChanges(
  projectId: string,
  actionId: string,
): Promise<GrowthWorkChangesOverview> {
  await getQualifiedWork(projectId, actionId);
  const [linkedChanges, availableChanges] = await Promise.all([
    repo.listManualChangeEventGraphsForAction(projectId, actionId, LIMIT),
    repo.listManualChangeEventGraphs(projectId, LIMIT),
  ]);
  return {
    actionId,
    linkedChanges: linkedChanges.map(toChangeDto),
    availableChanges: availableChanges.map(toChangeDto),
    limit: LIMIT,
  };
}

async function linkGrowthWorkChange(
  input: LinkGrowthWorkChangeInput,
): Promise<GrowthWorkChangeLink> {
  await getQualifiedWork(input.projectId, input.actionId);
  const event = await GrowthChangeEventsService.getChangeEvent(
    input.projectId,
    input.changeEventId,
  );
  if (event.event.source !== "manual")
    throw new AppError("NOT_FOUND", "Growth Change Event not found");
  await GrowthChangeEventsService.linkAction(input);
  return { actionId: input.actionId, changeEventId: input.changeEventId };
}

export const GrowthWorkChangesService = {
  getGrowthWorkChanges,
  linkGrowthWorkChange,
} as const;
