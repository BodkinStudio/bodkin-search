import { AppError } from "@/server/lib/errors";
import type { GrowthChangeEventType } from "@/types/schemas/growth-change-events";
import {
  growthManualChangeDtoSchema,
  type GrowthRecentChangesPageDto,
} from "@/types/schemas/growth-recent-changes";
import {
  growthEvidenceDisplayChangeDescription,
  growthEvidenceDisplayUrl,
} from "./GrowthEvidencePacket";
import { canonicalTimestamp } from "./GrowthMeasurementFacts";

const MAX_STORED_URLS = 100;
const MAX_DISPLAY_URLS = 5;

type ManualChangeEvent = {
  id: string;
  source: string;
  changeType: GrowthChangeEventType;
  description: string;
  happenedAt: string;
  createdAt: string;
};

function storedTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
}

export function projectManualChangeEvent(
  event: ManualChangeEvent,
  urls: string[],
): GrowthRecentChangesPageDto["changes"][number] {
  if (event.source !== "manual")
    throw new AppError("INTERNAL_ERROR", "Stored Change Event is not manual");
  if (urls.length < 1 || urls.length > MAX_STORED_URLS)
    throw new AppError(
      "INTERNAL_ERROR",
      "Stored Change Event exceeds the URL integrity limit",
    );

  const description = growthEvidenceDisplayChangeDescription(event.description);
  const displayUrls = urls.map(growthEvidenceDisplayUrl);

  return growthManualChangeDtoSchema.parse({
    id: event.id,
    source: "manual",
    changeType: event.changeType,
    description: description.content.slice(0, 2000),
    descriptionRedacted: description.redacted,
    descriptionTruncated:
      description.truncated || description.content.length > 2000,
    happenedAt: canonicalTimestamp(
      storedTimestamp(event.happenedAt),
      "Change Event happenedAt",
    ),
    recordedAt: canonicalTimestamp(
      storedTimestamp(event.createdAt),
      "Change Event recordedAt",
    ),
    urlCount: urls.length,
    displayUrls: displayUrls.slice(0, MAX_DISPLAY_URLS).map((url) => ({
      value: url.value,
      queryOrFragmentOmitted: url.omitted,
      withheld: url.withheld,
    })),
    displayUrlsOmitted: urls.length > MAX_DISPLAY_URLS,
    displayUrlsWithheld: displayUrls.some((url) => url.withheld),
  });
}
