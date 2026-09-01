import { AppError } from "@/server/lib/errors";
import type {
  GrowthWorkMeasurementPlan,
  GrowthWorkMeasurementSchedule,
} from "@/types/schemas/growth-work";
import { GrowthChangeEventsRepository } from "../repositories/GrowthChangeEventsRepository";
import { toChangeDto } from "./GrowthChangeLogService";
import { growthEvidenceDisplayUrl } from "./GrowthEvidencePacket";
import { calendarDateInTimezone } from "./GrowthMeasurementFacts";
import {
  growthMeasurementCollectionPeriods,
  growthMeasurementGscPropertyHash,
  growthMeasurementSourceAvailableOn,
} from "./GrowthWorkMeasurementCollectionService";
import type { GrowthMeasurementsService } from "./GrowthMeasurementsService";

const DAY_MS = 86_400_000;
const GSC_SOURCE_TIMEZONE = "America/Los_Angeles";

function shiftUtcDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function growthWorkMeasurementSchedule(
  anchorAt: string,
  settings: {
    reportTimezone: string;
    defaultBaselineDays: number;
    defaultCooldownDays: number;
    defaultPrimaryWindowDays: number;
    defaultLongWindowDays: number | null;
  },
): GrowthWorkMeasurementSchedule {
  const anchorDate = anchorAt.slice(0, 10);
  const baselineEnd = shiftUtcDate(anchorDate, -1);
  const cooldownEnd = shiftUtcDate(anchorDate, settings.defaultCooldownDays);
  const measurementStart = shiftUtcDate(cooldownEnd, 1);
  const measurementEnd = shiftUtcDate(
    measurementStart,
    settings.defaultPrimaryWindowDays - 1,
  );
  return {
    anchorAt,
    anchorDate,
    reportTimezone: settings.reportTimezone,
    baselineStart: shiftUtcDate(anchorDate, -settings.defaultBaselineDays),
    baselineEnd,
    cooldownEnd,
    measurementStart,
    measurementEnd,
    longMeasurementEnd:
      settings.defaultLongWindowDays == null
        ? null
        : shiftUtcDate(measurementEnd, settings.defaultLongWindowDays),
  };
}

function collectionDto(
  verified: Awaited<
    ReturnType<typeof GrowthMeasurementsService.getMeasurement>
  >,
  connected: boolean,
  now: Date,
) {
  const sourceDate = calendarDateInTimezone(
    now.toISOString(),
    GSC_SOURCE_TIMEZONE,
  );
  const supported = verified.metrics.every(
    ({ entityType, metricType }) =>
      entityType === "url" &&
      (metricType === "search_clicks" || metricType === "search_impressions"),
  );
  const periods = growthMeasurementCollectionPeriods(verified.plan).map(
    (period) => {
      const observations = verified.observations.filter(
        ({ periodType }) => periodType === period.periodType,
      );
      const complete = observations.filter(
        ({ completeness }) => completeness === 1,
      ).length;
      const evidenceRefs = new Set(
        observations.map(({ evidenceRef }) => evidenceRef),
      );
      const captureTimes = new Set(
        observations.map(({ capturedAt }) => capturedAt),
      );
      const periodPropertyHashes = new Set(
        observations
          .map(({ evidenceKind, evidenceRef }) =>
            evidenceKind === "gsc_period"
              ? growthMeasurementGscPropertyHash(evidenceRef)
              : null,
          )
          .filter((value): value is string => value !== null),
      );
      const sourceConsistent =
        observations.length > 0 &&
        observations.every(
          ({ evidenceKind, evidenceRef }) =>
            evidenceKind === "gsc_period" &&
            growthMeasurementGscPropertyHash(evidenceRef) !== null,
        ) &&
        evidenceRefs.size === 1 &&
        captureTimes.size === 1 &&
        periodPropertyHashes.size === 1;
      const sourceAvailableOn = growthMeasurementSourceAvailableOn(
        period.endDate,
      );
      const status =
        observations.length === verified.metrics.length &&
        complete === verified.metrics.length &&
        sourceConsistent
          ? ("collected" as const)
          : observations.length > 0
            ? ("inconsistent" as const)
            : verified.plan.status === "completed"
              ? ("not_collected" as const)
              : sourceDate >= sourceAvailableOn
                ? ("ready" as const)
                : ("waiting" as const);
      return {
        ...period,
        sourceAvailableOn,
        status,
        collectedMetricCount: complete,
        expectedMetricCount: verified.metrics.length,
      };
    },
  );
  const allCollected = periods.every(({ status }) => status === "collected");
  const propertyHashes = new Set(
    verified.observations
      .map(({ evidenceKind, evidenceRef }) =>
        evidenceKind === "gsc_period"
          ? growthMeasurementGscPropertyHash(evidenceRef)
          : null,
      )
      .filter((value): value is string => value !== null),
  );
  const sourceInconsistent =
    verified.observations.length > 0 &&
    (propertyHashes.size !== 1 ||
      verified.observations.some(
        ({ evidenceKind, evidenceRef }) =>
          evidenceKind !== "gsc_period" ||
          growthMeasurementGscPropertyHash(evidenceRef) === null,
      ));
  const inconsistent =
    periods.some(({ status }) => status === "inconsistent") ||
    sourceInconsistent;
  const state =
    verified.plan.status === "completed"
      ? ("closed" as const)
      : !supported
        ? ("unsupported" as const)
        : inconsistent
          ? ("inconsistent" as const)
          : allCollected
            ? ("collected" as const)
            : !connected
              ? ("missing_connection" as const)
              : periods.some(({ status }) => status === "ready")
                ? ("ready" as const)
                : ("waiting" as const);
  return {
    state,
    canCollect: state === "ready",
    nextAvailableOn:
      periods
        .filter(({ status }) => status === "waiting")
        .map(({ sourceAvailableOn }) => sourceAvailableOn)
        .toSorted()[0] ?? null,
    periods,
  };
}

export async function growthWorkMeasurementPlanDto(
  verified: Awaited<
    ReturnType<typeof GrowthMeasurementsService.getMeasurement>
  >,
  connected: boolean,
  now = new Date(),
): Promise<GrowthWorkMeasurementPlan> {
  const implementationChange = verified.implementationChangeEventId
    ? await GrowthChangeEventsRepository.getChangeEventGraph(
        verified.plan.projectId,
        verified.implementationChangeEventId,
      )
    : null;
  return {
    id: verified.plan.id,
    status: verified.plan.status,
    actionVersion: verified.plan.actionVersion,
    implementationChange: implementationChange
      ? toChangeDto(implementationChange)
      : null,
    schedule: {
      anchorAt: verified.plan.anchorAt,
      anchorDate: verified.plan.anchorDate,
      reportTimezone: verified.plan.reportTimezone,
      baselineStart: verified.plan.baselineStart,
      baselineEnd: verified.plan.baselineEnd,
      cooldownEnd: verified.plan.cooldownEnd,
      measurementStart: verified.plan.measurementStart,
      measurementEnd: verified.plan.measurementEnd,
      longMeasurementEnd: verified.plan.longMeasurementEnd,
    },
    metrics: verified.metrics.map((metric) => {
      const comparison = verified.comparisons.find(
        ({ metricId }) => metricId === metric.id,
      );
      if (!comparison)
        throw new AppError(
          "CONFLICT",
          "Stored Measurement comparison is incomplete",
        );
      return {
        metricType: metric.metricType,
        displayTarget:
          metric.entityType === "url"
            ? growthEvidenceDisplayUrl(metric.entityKey).value
            : null,
        isPrimary: metric.isPrimary,
        observations: verified.observations
          .filter(({ metricId }) => metricId === metric.id)
          .map(({ periodType, value, completeness, capturedAt }) => ({
            periodType,
            value,
            completeness,
            capturedAt,
          })),
        comparison: {
          baselineValue: comparison.baselineValue,
          measurementValue: comparison.currentValue,
          absoluteDelta: comparison.absoluteDelta,
          percentDelta: comparison.percentDelta,
          longTermValue: comparison.longTermValue,
          longTermAbsoluteDelta: comparison.longTermAbsoluteDelta,
          longTermPercentDelta: comparison.longTermPercentDelta,
        },
      };
    }),
    collection: collectionDto(verified, connected, now),
    dueDate: verified.dueDate,
    result: verified.result
      ? {
          outcome: verified.result.outcome,
          confidence: verified.result.confidence,
          summary: verified.result.summary,
          evaluatedAt: verified.result.evaluatedAt,
        }
      : null,
  };
}
