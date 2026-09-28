import { AppError } from "@/server/lib/errors";
import {
  growthWeeklyReviewResponseSchema,
  type GrowthWeeklyReviewResponse,
  type ScheduledGrowthWeeklyReviewInput,
} from "@/types/schemas/growth-weekly-review";
import { GrowthWeeklyReviewRepository } from "../repositories/GrowthWeeklyReviewRepository";
import { GrowthDueMeasurementsService } from "./GrowthDueMeasurementsService";
import {
  calendarDateInTimezone,
  earliestUtcCalendarDateBoundary,
} from "./GrowthMeasurementFacts";
import { GrowthRunsService } from "./GrowthRunsService";
import { GrowthSettingsService } from "./GrowthSettingsService";
import { growthWeeklyReviewCoordinate } from "./GrowthWeeklySchedule";

export const GROWTH_WEEKLY_REVIEW_VERSION = "growth-weekly-review-v1";
const RUN_TYPE = "weekly_review" as const;
const PARTIAL_CODE = "WEEKLY_REVIEW_PARTIAL";
const PARTIAL_MESSAGE =
  "Weekly review completed with an incomplete due-Measurement section.";
const FAILED_CODE = "WEEKLY_REVIEW_FAILED";
const FAILED_MESSAGE = "Weekly review facts could not be read.";

type Run = NonNullable<
  Awaited<ReturnType<typeof GrowthRunsService.getRunBySlot>>
>;
type Skip = { skipped: true; reason: "settings_changed" };

function runSummary(run: Run) {
  return {
    id: run.id,
    status: run.status,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    failureCode: run.failureCode,
    failureMessage: run.failureMessage,
  };
}

function replay(run: Run): GrowthWeeklyReviewResponse {
  return growthWeeklyReviewResponseSchema.parse({
    replayed: true,
    run: runSummary(run),
  });
}

function isWeeklyRun(run: Run, input: ScheduledGrowthWeeklyReviewInput) {
  return (
    run.runType === RUN_TYPE &&
    run.trigger === "scheduled" &&
    run.detectorVersion === GROWTH_WEEKLY_REVIEW_VERSION &&
    run.cadenceSlot === input.cadenceSlot &&
    run.periodStart === input.periodStart &&
    run.periodEnd === input.periodEnd
  );
}

function validateCoordinate(input: ScheduledGrowthWeeklyReviewInput) {
  const coordinate = growthWeeklyReviewCoordinate(
    input.scheduledAt,
    input.reportTimezone,
  );
  const localDate = calendarDateInTimezone(
    input.scheduledAt,
    input.reportTimezone,
  );
  const boundary = earliestUtcCalendarDateBoundary(
    localDate,
    input.reportTimezone,
  );
  if (
    boundary !== input.scheduledAt ||
    coordinate.cadenceSlot !== input.cadenceSlot ||
    coordinate.periodStart !== input.periodStart ||
    coordinate.periodEnd !== input.periodEnd
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Scheduled weekly review coordinate is invalid",
    );
}

function recommendedFocus(input: {
  materialGains: number;
  materialLosses: number;
  newStrikingDistanceOpportunities: number;
  actionsAtRisk: number;
  actionsReadyForMeasurement: number | null;
}) {
  if (input.actionsReadyForMeasurement === null)
    return "measurement_scan_required" as const;
  if (input.actionsReadyForMeasurement > 0)
    return "measurement_review" as const;
  if (input.actionsAtRisk > 0) return "action_recovery" as const;
  if (input.materialLosses > 0) return "loss_investigation" as const;
  if (input.newStrikingDistanceOpportunities > 0)
    return "striking_distance" as const;
  if (input.materialGains > 0) return "reinforce_gains" as const;
  return "no_urgent_work" as const;
}

async function runScheduledWeeklyReview(
  input: ScheduledGrowthWeeklyReviewInput,
  now = new Date(),
): Promise<GrowthWeeklyReviewResponse | Skip> {
  if (Number.isNaN(now.valueOf()))
    throw new AppError("VALIDATION_ERROR", "Weekly review clock is invalid");
  validateCoordinate(input);
  const existing = await GrowthRunsService.getRunBySlot(
    input.projectId,
    RUN_TYPE,
    input.cadenceSlot,
  );
  if (existing) {
    if (!isWeeklyRun(existing, input))
      throw new AppError("CONFLICT", "Weekly review slot is occupied");
    if (existing.status !== "running") return replay(existing);
  }

  const settings = await GrowthSettingsService.getSchedulingSettings(
    input.projectId,
  );
  const settingsChanged =
    !settings ||
    !settings.growthEnabled ||
    settings.reportCadence !== "weekly" ||
    settings.reportTimezone !== input.reportTimezone ||
    settings.settingsRevision !== input.settingsRevision;
  if (existing && settingsChanged) {
    return replay(
      await GrowthRunsService.failRun({
        projectId: input.projectId,
        runId: existing.id,
        failureCode: FAILED_CODE,
        failureMessage: FAILED_MESSAGE,
      }),
    );
  }
  if (!existing && settingsChanged)
    return { skipped: true, reason: "settings_changed" };

  const claim = existing
    ? { run: existing, claimed: false }
    : await GrowthRunsService.claimScheduledRun({
        projectId: input.projectId,
        runType: RUN_TYPE,
        cadenceSlot: input.cadenceSlot,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        detectorVersion: GROWTH_WEEKLY_REVIEW_VERSION,
        settingsRevision: input.settingsRevision,
        reportCadence: "weekly",
      });
  if (!claim.run) return { skipped: true, reason: "settings_changed" };
  if (!isWeeklyRun(claim.run, input))
    throw new AppError("CONFLICT", "Weekly review slot is occupied");
  if (!claim.claimed && claim.run.status !== "running")
    return replay(claim.run);

  let facts: Awaited<
    ReturnType<typeof GrowthWeeklyReviewRepository.getCompactFacts>
  >;
  let due: Awaited<
    ReturnType<typeof GrowthDueMeasurementsService.getDueMeasurements>
  >;
  try {
    [facts, due] = await Promise.all([
      GrowthWeeklyReviewRepository.getCompactFacts({
        projectId: input.projectId,
        startAt: earliestUtcCalendarDateBoundary(
          input.periodStart,
          input.reportTimezone,
        ),
        endAt: input.scheduledAt,
        asOf: now.toISOString(),
      }),
      GrowthDueMeasurementsService.getDueMeasurements(input.projectId, {
        now,
      }),
    ]);
  } catch {
    return replay(
      await GrowthRunsService.failRun({
        projectId: input.projectId,
        runId: claim.run.id,
        failureCode: FAILED_CODE,
        failureMessage: FAILED_MESSAGE,
      }),
    );
  }

  const overflow = due.scanState === "overflow";
  const sections = {
    ...facts,
    actionsReadyForMeasurement: overflow ? null : due.items.length,
  };
  const terminal = overflow
    ? await GrowthRunsService.completeRunWithErrors({
        projectId: input.projectId,
        runId: claim.run.id,
        failureCode: PARTIAL_CODE,
        failureMessage: PARTIAL_MESSAGE,
      })
    : await GrowthRunsService.completeRun({
        projectId: input.projectId,
        runId: claim.run.id,
      });
  return growthWeeklyReviewResponseSchema.parse({
    replayed: false,
    consistency: "current_not_snapshot",
    run: runSummary(terminal),
    sections: { ...sections, recommendedFocus: recommendedFocus(sections) },
    warnings: overflow ? ["DUE_MEASUREMENTS_OVERFLOW"] : [],
  });
}

export const GrowthWeeklyReviewService = { runScheduledWeeklyReview } as const;
