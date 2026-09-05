import { AppError } from "@/server/lib/errors";
import type {
  GrowthMeasurementPeriodType,
  RecordGrowthMeasurementObservationInput,
} from "@/types/schemas/growth-measurements";
import type { CollectGrowthWorkMeasurementInput } from "@/types/schemas/growth-work";
import { GrowthMeasurementsRepository } from "../repositories/GrowthMeasurementsRepository";
import {
  calendarDateInTimezone,
  growthMeasurementSourceAvailableOn,
} from "./GrowthMeasurementFacts";
export { growthMeasurementSourceAvailableOn } from "./GrowthMeasurementFacts";
import { projectFrozenGrowthSearchPerformanceFacts } from "./GrowthMeasurementGscProjector";
import { GrowthMeasurementsService } from "./GrowthMeasurementsService";
import {
  collectFrozenGrowthSearchPerformance,
  GROWTH_SEARCH_PERFORMANCE_MAX_PAGE_REQUESTS,
} from "./GrowthSearchPerformanceAdapter";
import { getQualifiedWork } from "./GrowthInvestigationsService";

const GSC_SOURCE_TIMEZONE = "America/Los_Angeles";
const GSC_EVIDENCE_PATTERN = /^gsc:measurement:v1:([a-f0-9]{64}):[a-f0-9]{64}$/;

export function growthMeasurementGscPropertyHash(evidenceRef: string) {
  return GSC_EVIDENCE_PATTERN.exec(evidenceRef)?.[1] ?? null;
}

function shiftUtcDate(date: string, days: number) {
  let shifted = date;
  const direction = days < 0 ? -1 : 1;
  for (let count = 0; count < Math.abs(days); count += 1) {
    const parsed = new Date(`${shifted}T00:00:00.000Z`);
    parsed.setUTCDate(parsed.getUTCDate() + direction);
    shifted = parsed.toISOString().slice(0, 10);
  }
  return shifted;
}

export function growthMeasurementCollectionPeriods(plan: {
  baselineStart: string;
  baselineEnd: string;
  measurementStart: string;
  measurementEnd: string;
  longMeasurementEnd: string | null;
}) {
  const periods: Array<{
    periodType: GrowthMeasurementPeriodType;
    startDate: string;
    endDate: string;
  }> = [
    {
      periodType: "baseline",
      startDate: plan.baselineStart,
      endDate: plan.baselineEnd,
    },
    {
      periodType: "measurement",
      startDate: plan.measurementStart,
      endDate: plan.measurementEnd,
    },
  ];
  if (plan.longMeasurementEnd)
    periods.push({
      periodType: "long_term",
      startDate: shiftUtcDate(plan.measurementEnd, 1),
      endDate: plan.longMeasurementEnd,
    });
  return periods;
}

function conflict(message: string): never {
  throw new AppError("CONFLICT", message);
}

function validation(message: string): never {
  throw new AppError("VALIDATION_ERROR", message);
}

function storedPropertyHashes(
  observations: Awaited<
    ReturnType<typeof GrowthMeasurementsService.getMeasurement>
  >["observations"],
) {
  const hashes = new Set<string>();
  const periodProvenance = new Map<
    GrowthMeasurementPeriodType,
    { evidenceRef: string; capturedAt: string }
  >();
  for (const observation of observations) {
    if (observation.evidenceKind !== "gsc_period")
      conflict(
        "Stored Measurement evidence cannot be mixed with Search Console collection",
      );
    const propertyHash = growthMeasurementGscPropertyHash(
      observation.evidenceRef,
    );
    if (!propertyHash)
      conflict("Stored Measurement Search Console source is unverifiable");
    hashes.add(propertyHash);
    const provenance = periodProvenance.get(observation.periodType);
    if (
      provenance &&
      (provenance.evidenceRef !== observation.evidenceRef ||
        provenance.capturedAt !== observation.capturedAt)
    ) {
      conflict(
        "Stored Measurement period uses mixed Search Console provenance",
      );
    }
    periodProvenance.set(observation.periodType, {
      evidenceRef: observation.evidenceRef,
      capturedAt: observation.capturedAt,
    });
  }
  if (hashes.size > 1)
    conflict(
      "Stored Measurement evidence uses different Search Console sources",
    );
  return hashes;
}

/**
 * Collects only mature, wholly missing periods from the immutable plan. All
 * provider reads finish before the observation set is written atomically.
 */
export async function collectGrowthWorkMeasurementEvidence(
  input: CollectGrowthWorkMeasurementInput,
  options: { now?: Date } = {},
) {
  const work = await getQualifiedWork(input.projectId, input.actionId);
  if (
    work.status !== "measuring" ||
    work.stateVersion !== input.expectedActionVersion
  ) {
    conflict("Growth Work is not at the expected measuring version");
  }
  const storedPlan =
    await GrowthMeasurementsRepository.getMeasurementPlanByAction(
      input.projectId,
      input.actionId,
    );
  if (!storedPlan)
    throw new AppError("NOT_FOUND", "Growth Measurement Plan not found");
  const verified = await GrowthMeasurementsService.getMeasurement(
    input.projectId,
    storedPlan.id,
  );
  if (
    verified.plan.status !== "active" ||
    verified.plan.actionVersion !== input.expectedActionVersion
  ) {
    conflict("Growth Measurement Plan is not active at the expected version");
  }
  if (
    verified.metrics.length === 0 ||
    !verified.metrics.every(
      ({ entityType, metricType }) =>
        entityType === "url" &&
        (metricType === "search_clicks" || metricType === "search_impressions"),
    )
  ) {
    validation(
      "Measurement Plan metrics are not supported by Search Console collection",
    );
  }
  const existingPropertyHashes = storedPropertyHashes(verified.observations);

  const periods = growthMeasurementCollectionPeriods(verified.plan);
  const missingPeriods = periods.filter((period) => {
    const observations = verified.observations.filter(
      ({ periodType }) => periodType === period.periodType,
    );
    if (observations.length === 0) return true;
    if (
      observations.length !== verified.metrics.length ||
      observations.some(({ completeness }) => completeness !== 1)
    ) {
      conflict("Measurement Plan has a partial or incomplete saved period");
    }
    return false;
  });
  if (missingPeriods.length === 0) return verified;

  const now = options.now ?? new Date();
  const capturedAt = now.toISOString();
  const sourceDate = calendarDateInTimezone(capturedAt, GSC_SOURCE_TIMEZONE);
  const readyPeriods = missingPeriods.filter(
    ({ endDate }) => sourceDate >= growthMeasurementSourceAvailableOn(endDate),
  );
  if (readyPeriods.length === 0)
    conflict("No Search Console measurement period is available yet");

  const targetUrls = [
    ...new Set(verified.metrics.map(({ entityKey }) => entityKey)),
  ].toSorted();
  const metrics = verified.metrics.map(
    ({ id, metricType, entityType, entityKey }) => ({
      metricId: id,
      metricType,
      entityType,
      entityKey,
    }),
  );
  const facts: RecordGrowthMeasurementObservationInput[] = [];
  let attemptPropertyHash: string | null = null;
  let remainingPageRequests = GROWTH_SEARCH_PERFORMANCE_MAX_PAGE_REQUESTS;
  for (const period of readyPeriods) {
    if (remainingPageRequests === 0)
      conflict("Search Console page request allowance is exhausted");
    const snapshot = await collectFrozenGrowthSearchPerformance({
      projectId: input.projectId,
      startDate: period.startDate,
      endDate: period.endDate,
      capturedAt,
      targetUrls,
      maxPageRequests: remainingPageRequests,
    });
    if (
      !Number.isSafeInteger(snapshot.requestsUsed) ||
      snapshot.requestsUsed < 1 ||
      snapshot.requestsUsed > remainingPageRequests
    ) {
      conflict(
        "Search Console collection returned an invalid request allowance",
      );
    }
    remainingPageRequests -= snapshot.requestsUsed;
    const projected = await projectFrozenGrowthSearchPerformanceFacts({
      snapshot,
      period: {
        periodType: period.periodType,
        effectiveStart: period.startDate,
        effectiveEnd: period.endDate,
      },
      metrics,
    });
    if (
      (attemptPropertyHash !== null &&
        attemptPropertyHash !== projected.propertyHash) ||
      (existingPropertyHashes.size === 1 &&
        !existingPropertyHashes.has(projected.propertyHash))
    ) {
      conflict("Search Console property changed between Measurement periods");
    }
    attemptPropertyHash = projected.propertyHash;
    facts.push(
      ...projected.facts.map((fact) => ({
        projectId: input.projectId,
        measurementPlanId: verified.plan.id,
        ...fact,
      })),
    );
  }
  await GrowthMeasurementsService.recordObservations(facts);
  return GrowthMeasurementsService.getMeasurement(
    input.projectId,
    verified.plan.id,
  );
}
