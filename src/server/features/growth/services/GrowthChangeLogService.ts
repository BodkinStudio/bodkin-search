import { AppError } from "@/server/lib/errors";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { growthEvidenceDisplayUrl } from "./GrowthEvidencePacket";
import { GrowthChangeEventsRepository as repo } from "../repositories/GrowthChangeEventsRepository";
import { GrowthChangeEventsService } from "./GrowthChangeEventsService";
import type {
  GrowthPageChangeType,
  RecordGrowthPageChangeInput,
} from "@/types/schemas/growth-change-log";

const LIMIT = 50;

type ChangeDto = {
  id: string;
  changeType: GrowthPageChangeType;
  description: string;
  happenedAt: string;
  recordedAt: string;
  displayUrls: Array<string | null>;
};

function toDto(
  graph: Awaited<ReturnType<typeof GrowthChangeEventsService.getChangeEvent>>,
): ChangeDto {
  return {
    id: graph.event.id,
    changeType: graph.event.changeType,
    description: graph.event.description,
    happenedAt: graph.event.happenedAt,
    recordedAt: graph.event.createdAt,
    displayUrls: graph.urls.map((url) => growthEvidenceDisplayUrl(url).value),
  };
}

function creationKey(keyPageId: string, requestKey: string) {
  return `manual-key-page:${keyPageId}:${requestKey}`;
}

async function getGrowthChangeLog(projectId: string) {
  const [domain, context, graphs] = await Promise.all([
    repo.projectDomain(projectId),
    ProjectContextService.getProjectContext(projectId),
    repo.listManualChangeEventGraphs(projectId, LIMIT),
  ]);
  return {
    setup: !domain
      ? ("missing_domain" as const)
      : context.keyPages.length === 0
        ? ("missing_key_pages" as const)
        : ("ready" as const),
    keyPages: context.keyPages.map((page) => ({
      id: page.id,
      displayUrl: growthEvidenceDisplayUrl(page.url).value,
    })),
    changes: graphs.map(toDto),
    limit: LIMIT,
  };
}

async function recordGrowthPageChange(
  input: RecordGrowthPageChangeInput & { actorId: string },
) {
  const key = creationKey(input.keyPageId, input.requestKey);
  const existing = await repo.getChangeEventByKey(input.projectId, key);
  if (existing) {
    const graph = await repo.getChangeEventGraph(input.projectId, existing.id);
    if (!graph)
      throw new AppError("NOT_FOUND", "Growth Change Event not found");
    return toDto(
      await GrowthChangeEventsService.recordManualEvent({
        projectId: input.projectId,
        creationKey: key,
        changeType: input.changeType,
        actorType: "user",
        actorId: input.actorId,
        description: input.description,
        happenedAt: `${input.happenedOn}T00:00:00.000Z`,
        urls: graph.urls,
      }),
    );
  }

  const context = await ProjectContextService.getProjectContext(
    input.projectId,
  );
  const page = context.keyPages.find((item) => item.id === input.keyPageId);
  if (!page)
    throw new AppError("VALIDATION_ERROR", "Select a configured key page");
  return toDto(
    await GrowthChangeEventsService.recordManualEvent({
      projectId: input.projectId,
      creationKey: key,
      changeType: input.changeType,
      actorType: "user",
      actorId: input.actorId,
      description: input.description,
      happenedAt: `${input.happenedOn}T00:00:00.000Z`,
      urls: [page.url],
    }),
  );
}

export const GrowthChangeLogService = {
  getGrowthChangeLog,
  recordGrowthPageChange,
} as const;
