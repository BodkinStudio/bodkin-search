import { AppError } from "@/server/lib/errors";
import {
  growthMeasurementsPageDtoSchema,
  growthMeasurementsRequestSchema,
  type GrowthMeasurementsPageDto,
  type GrowthMeasurementsRequest,
} from "@/types/schemas/growth-measurements-list";
import { GrowthMeasurementsReadRepository } from "../repositories/GrowthMeasurementsReadRepository";
import {
  growthEvidenceDisplayActionText,
  growthEvidenceDisplayMeasurementSummary,
} from "./GrowthEvidencePacket";
import { canonicalTimestamp } from "./GrowthMeasurementFacts";

const SQLITE_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
function timestamp(value: string, label: string) {
  return canonicalTimestamp(
    SQLITE_TIMESTAMP.test(value) ? `${value.replace(" ", "T")}Z` : value,
    label,
  );
}
function text(
  value: string,
  max: number,
  projector = growthEvidenceDisplayActionText,
) {
  const projected = projector(value);
  return {
    content: projected.content.slice(0, max),
    redacted: projected.redacted,
    truncated: projected.truncated || projected.content.length > max,
  };
}
function planLifecycle(row: {
  status: string;
  actionVersion: number;
  actionStatus: string;
  actionStateVersion: number;
}) {
  return (row.status === "active" &&
    row.actionStatus === "measuring" &&
    row.actionStateVersion === row.actionVersion) ||
    (row.status === "completed" &&
      row.actionStatus === "evaluated" &&
      row.actionStateVersion === row.actionVersion + 1)
    ? ("aligned" as const)
    : ("inconsistent" as const);
}

async function listMeasurements(
  input: GrowthMeasurementsRequest,
): Promise<GrowthMeasurementsPageDto> {
  const request = growthMeasurementsRequestSchema.parse(input);
  const roots =
    await GrowthMeasurementsReadRepository.listMeasurementPlansPage(request);
  const emitted = roots.slice(0, request.limit);
  const ids = emitted.map((row) => row.id);
  const [metricRows, resultRows] = await Promise.all([
    GrowthMeasurementsReadRepository.listMetricsForMeasurementPlans(
      request.projectId,
      ids,
    ),
    GrowthMeasurementsReadRepository.listResultsForMeasurementPlans(
      request.projectId,
      ids,
    ),
  ]);
  const metrics = new Map<string, { isPrimary: boolean }[]>();
  for (const row of metricRows)
    metrics.set(row.measurementPlanId, [
      ...(metrics.get(row.measurementPlanId) ?? []),
      row,
    ]);
  const results = new Map<string, (typeof resultRows)[number]>();
  for (const row of resultRows) {
    if (results.has(row.measurementPlanId))
      throw new AppError(
        "INTERNAL_ERROR",
        "Stored Measurement Plan has multiple Results",
      );
    results.set(row.measurementPlanId, row);
  }
  const measurements = emitted.map((row) => {
    const metricValues = metrics.get(row.id) ?? [];
    if (
      metricValues.length < 1 ||
      metricValues.length > 50 ||
      !metricValues.some((value) => value.isPrimary)
    )
      throw new AppError(
        "INTERNAL_ERROR",
        "Stored Measurement Plan violates Metric integrity",
      );
    const result = results.get(row.id) ?? null;
    const completedAt =
      row.completedAt === null
        ? null
        : timestamp(row.completedAt, "Measurement Plan completedAt");
    if (row.status === "active" && (completedAt !== null || result !== null))
      throw new AppError(
        "INTERNAL_ERROR",
        "Active Measurement Plan has completion data",
      );
    if (
      row.status === "completed" &&
      (!completedAt ||
        !result ||
        timestamp(result.evaluatedAt, "Measurement Result evaluatedAt") !==
          completedAt)
    )
      throw new AppError(
        "INTERNAL_ERROR",
        "Completed Measurement Plan has invalid Result lifecycle",
      );
    const title = text(row.actionTitle, 300);
    const summary = result
      ? text(result.summary, 1000, growthEvidenceDisplayMeasurementSummary)
      : null;
    return {
      id: row.id,
      actionId: row.actionId,
      actionTitle: title.content,
      actionTitleRedacted: title.redacted,
      actionTitleTruncated: title.truncated,
      actionStatus: row.actionStatus,
      actionLifecycle: planLifecycle(row),
      status: row.status,
      actionVersion: row.actionVersion,
      anchorAt: timestamp(row.anchorAt, "Measurement Plan anchorAt"),
      anchorDate: row.anchorDate,
      reportTimezone: row.reportTimezone,
      comparisonMode: row.comparisonMode,
      baselineStart: row.baselineStart,
      baselineEnd: row.baselineEnd,
      cooldownEnd: row.cooldownEnd,
      measurementStart: row.measurementStart,
      measurementEnd: row.measurementEnd,
      longMeasurementEnd: row.longMeasurementEnd,
      dueDate: row.longMeasurementEnd ?? row.measurementEnd,
      createdAt: timestamp(row.createdAt, "Measurement Plan createdAt"),
      completedAt,
      metricCount: metricValues.length,
      primaryMetricCount: metricValues.filter((value) => value.isPrimary)
        .length,
      result:
        result && summary
          ? {
              outcome: result.outcome,
              confidence: result.confidence,
              summary: summary.content,
              summaryRedacted: summary.redacted,
              summaryTruncated: summary.truncated,
              evaluatedAt: timestamp(
                result.evaluatedAt,
                "Measurement Result evaluatedAt",
              ),
            }
          : null,
    };
  });
  const last = emitted.at(-1);
  return growthMeasurementsPageDtoSchema.parse({
    measurements,
    limit: request.limit,
    hasMore: roots.length > request.limit,
    nextCursor:
      roots.length > request.limit && last
        ? {
            createdAt: timestamp(last.createdAt, "Measurement Plan createdAt"),
            id: last.id,
          }
        : null,
  });
}

export const GrowthMeasurementsReadService = { listMeasurements } as const;
