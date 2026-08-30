import { AppError } from "@/server/lib/errors";
import {
  buildGrowthEvidencePacketSchema,
  type BuildGrowthEvidencePacketInput,
  type GrowthEvidencePacket,
} from "@/types/schemas/growth-evidence-packet";
import { GrowthRunsRepository } from "../repositories/GrowthRunsRepository";
import { ProjectRepository } from "../../projects/repositories/ProjectRepository";
import { getProjectContext } from "../../project-context/services/ProjectContextService";
import { GrowthChangeEventsService } from "./GrowthChangeEventsService";
import { buildGrowthEvidencePacket } from "./GrowthEvidencePacket";

function notFound(message: string): never {
  throw new AppError("NOT_FOUND", message);
}

/** Read-only composition for already-authorised internal callers. */
export async function assembleGrowthEvidencePacket(
  value: BuildGrowthEvidencePacketInput,
): Promise<GrowthEvidencePacket> {
  const input = buildGrowthEvidencePacketSchema.parse(value);
  const selectedEventIds = [
    ...new Set(input.knownChangeEventIds ?? []),
  ].toSorted();
  if (selectedEventIds.length > 10)
    throw new AppError(
      "VALIDATION_ERROR",
      "At most 10 Change Events may be selected",
    );
  const project = await ProjectRepository.getProjectForOrganization(
    input.projectId,
    input.organizationId,
  );
  if (
    !project ||
    project.id !== input.projectId ||
    project.organizationId !== input.organizationId
  )
    notFound("Growth project not found");
  const signal = await GrowthRunsRepository.getSignal(
    input.projectId,
    input.signalId,
  );
  if (
    !signal ||
    signal.id !== input.signalId ||
    signal.projectId !== input.projectId
  )
    notFound("Growth Signal not found");
  const run = await GrowthRunsRepository.getRun(input.projectId, signal.runId);
  if (!run || run.id !== signal.runId || run.projectId !== input.projectId)
    notFound("Growth Run not found");
  const [context, events] = await Promise.all([
    getProjectContext(input.projectId),
    Promise.all(
      selectedEventIds.map((id) =>
        GrowthChangeEventsService.getChangeEvent(input.projectId, id),
      ),
    ),
  ]);
  for (const graph of events) {
    if (graph.event.projectId !== input.projectId)
      notFound("Growth Change Event not found");
  }
  return buildGrowthEvidencePacket({
    organizationId: input.organizationId,
    project: { id: project.id, name: project.name },
    signal,
    run,
    context,
    assembledAt: input.assembledAt,
    selectedEventIds,
    selectionProvided: input.knownChangeEventIds !== undefined,
    events,
  });
}
