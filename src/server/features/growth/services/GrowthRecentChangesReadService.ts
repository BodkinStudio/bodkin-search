import { GrowthChangeEventsRepository } from "../repositories/GrowthChangeEventsRepository";
import { canonicalTimestamp } from "./GrowthMeasurementFacts";
import { projectManualChangeEvent } from "./GrowthManualChangeProjector";
import {
  growthRecentChangesPageDtoSchema,
  growthRecentChangesRequestSchema,
  type GrowthRecentChangesPageDto,
  type GrowthRecentChangesRequest,
} from "@/types/schemas/growth-recent-changes";

const sqliteTimestamp = (value: string) =>
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;

async function listRecentChanges(
  input: GrowthRecentChangesRequest,
): Promise<GrowthRecentChangesPageDto> {
  const request = growthRecentChangesRequestSchema.parse(input);
  const roots =
    await GrowthChangeEventsRepository.listRecentManualChangeEventsPage(
      request,
    );
  const emitted = roots.slice(0, request.limit);
  const urlRows =
    await GrowthChangeEventsRepository.listUrlsForRecentChangeEvents(
      request.projectId,
      emitted.map((row) => row.id),
    );
  const urls = new Map<string, string[]>();
  for (const row of urlRows)
    urls.set(row.changeEventId, [
      ...(urls.get(row.changeEventId) ?? []),
      row.url,
    ]);
  const changes = emitted.map((row) =>
    projectManualChangeEvent(row, urls.get(row.id) ?? []),
  );
  const last = emitted.at(-1);
  return growthRecentChangesPageDtoSchema.parse({
    changes,
    limit: request.limit,
    hasMore: roots.length > request.limit,
    nextCursor:
      roots.length > request.limit && last
        ? {
            happenedAt: canonicalTimestamp(
              sqliteTimestamp(last.happenedAt),
              "Change Event happenedAt",
            ),
            id: last.id,
          }
        : null,
  });
}

export const GrowthRecentChangesReadService = { listRecentChanges } as const;
