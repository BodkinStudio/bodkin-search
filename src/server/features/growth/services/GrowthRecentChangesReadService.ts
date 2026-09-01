import { AppError } from "@/server/lib/errors";
import { GrowthChangeEventsRepository } from "../repositories/GrowthChangeEventsRepository";
import {
  growthEvidenceDisplayChangeDescription,
  growthEvidenceDisplayUrl,
} from "./GrowthEvidencePacket";
import { canonicalTimestamp } from "./GrowthMeasurementFacts";
import {
  growthRecentChangesPageDtoSchema,
  growthRecentChangesRequestSchema,
  type GrowthRecentChangesPageDto,
  type GrowthRecentChangesRequest,
} from "@/types/schemas/growth-recent-changes";

const MAX_STORED_URLS = 100;
const MAX_DISPLAY_URLS = 5;
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
  const changes = emitted.map((row) => {
    if (row.source !== "manual")
      throw new AppError("INTERNAL_ERROR", "Stored Change Event is not manual");
    const values = urls.get(row.id) ?? [];
    if (values.length < 1 || values.length > MAX_STORED_URLS)
      throw new AppError(
        "INTERNAL_ERROR",
        "Stored Change Event exceeds the URL integrity limit",
      );
    const description = growthEvidenceDisplayChangeDescription(row.description);
    const displayUrls = values.map(growthEvidenceDisplayUrl);
    return {
      id: row.id,
      source: "manual" as const,
      changeType: row.changeType,
      description: description.content.slice(0, 2000),
      descriptionRedacted: description.redacted,
      descriptionTruncated:
        description.truncated || description.content.length > 2000,
      happenedAt: canonicalTimestamp(
        sqliteTimestamp(row.happenedAt),
        "Change Event happenedAt",
      ),
      recordedAt: canonicalTimestamp(
        sqliteTimestamp(row.createdAt),
        "Change Event recordedAt",
      ),
      urlCount: values.length,
      displayUrls: displayUrls.slice(0, MAX_DISPLAY_URLS).map((url) => ({
        value: url.value,
        queryOrFragmentOmitted: url.omitted,
        withheld: url.withheld,
      })),
      displayUrlsOmitted: values.length > MAX_DISPLAY_URLS,
      displayUrlsWithheld: displayUrls.some((url) => url.withheld),
    };
  });
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
