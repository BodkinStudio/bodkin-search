import { AppError } from "@/server/lib/errors";
import {
  growthDueMeasurementsDtoSchema,
  type GrowthDueMeasurementsDto,
} from "@/types/schemas/growth-project-summary";
import { GrowthProjectSummaryRepository } from "../repositories/GrowthProjectSummaryRepository";
import { growthEvidenceDisplayActionText } from "./GrowthEvidencePacket";
import {
  calendarDateInTimezone,
  nextCalendarDate,
} from "./GrowthMeasurementFacts";

const DISPLAY_LIMIT = 5;
const MEASUREMENT_SCAN_LIMIT = 51;

type MeasurementCandidateRow = Awaited<
  ReturnType<
    typeof GrowthProjectSummaryRepository.listActiveMeasurementCandidates
  >
>[number];

function boundedActionTitle(value: string) {
  const projected = growthEvidenceDisplayActionText(value);
  return {
    value: projected.content.slice(0, 300),
    redacted: projected.redacted,
    truncated: projected.truncated || projected.content.length > 300,
  };
}

function measurementIntegrity(row: MeasurementCandidateRow) {
  if (row.actionStatus == null) return "action_missing" as const;
  if (row.actionStatus !== "measuring") return "action_state_mismatch" as const;
  if (row.actionStateVersion !== row.actionVersion)
    return "action_version_mismatch" as const;
  return "consistent" as const;
}

function dueMeasurement(row: MeasurementCandidateRow, now: Date) {
  // Measurement end dates are inclusive. A Plan is due only once its frozen
  // timezone has entered the following local calendar date.
  const availableOn = nextCalendarDate(
    row.longMeasurementEnd ?? row.measurementEnd,
  );
  const nowDate = calendarDateInTimezone(now.toISOString(), row.reportTimezone);
  if (nowDate < availableOn) return null;
  return {
    id: row.id,
    actionId: row.actionId,
    actionTitle:
      row.actionTitle == null ? null : boundedActionTitle(row.actionTitle),
    availableOn,
    reportTimezone: row.reportTimezone,
    actionStatus: row.actionStatus ?? null,
    integrity: measurementIntegrity(row),
  };
}

function codeUnitCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function getDueMeasurements(
  projectId: string,
  options: { now?: Date } = {},
): Promise<GrowthDueMeasurementsDto> {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.valueOf()))
    throw new AppError(
      "VALIDATION_ERROR",
      "Measurement queue clock is invalid",
    );

  const candidates =
    await GrowthProjectSummaryRepository.listActiveMeasurementCandidates(
      projectId,
      MEASUREMENT_SCAN_LIMIT,
    );
  if (candidates.length >= MEASUREMENT_SCAN_LIMIT) {
    return growthDueMeasurementsDtoSchema.parse({
      scanState: "overflow",
      items: [],
      hasMore: true,
    });
  }

  const due = candidates
    .map((candidate) => dueMeasurement(candidate, now))
    .filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        candidate !== null,
    )
    .toSorted((left, right) =>
      left.availableOn === right.availableOn
        ? codeUnitCompare(left.id, right.id)
        : codeUnitCompare(left.availableOn, right.availableOn),
    );
  return growthDueMeasurementsDtoSchema.parse({
    scanState: "complete",
    items: due.slice(0, DISPLAY_LIMIT),
    hasMore: due.length > DISPLAY_LIMIT,
  });
}

export const GrowthDueMeasurementsService = { getDueMeasurements } as const;
