import { GrowthSettingsRepository } from "@/server/features/growth/repositories/GrowthSettingsRepository";
import { AppError } from "@/server/lib/errors";
import {
  GROWTH_SETTINGS_DEFAULTS,
  type GrowthSettingsInput,
} from "@/types/schemas/growth";
import { initialGrowthMonthlyReviewAt } from "./GrowthMonthlySchedule";
import { initialGrowthWeeklyReviewAt } from "./GrowthWeeklySchedule";

type AuthorizedProjectScope = {
  projectId: string;
  projectDomain: string | null;
};

export async function getSettings(projectId: string) {
  const row = await GrowthSettingsRepository.getByProjectId(projectId);
  if (row) {
    const {
      nextMonthlyReviewAt: _schedule,
      nextWeeklyReviewAt: _weeklySchedule,
      settingsRevision: _revision,
      ...settings
    } = row;
    return { ...settings, persisted: true as const };
  }

  return {
    projectId,
    ...GROWTH_SETTINGS_DEFAULTS,
    createdAt: null,
    updatedAt: null,
    persisted: false as const,
  };
}

function getSchedulingSettings(projectId: string) {
  return GrowthSettingsRepository.getByProjectId(projectId);
}

export async function updateSettings(
  project: AuthorizedProjectScope,
  input: GrowthSettingsInput,
  now = new Date(),
) {
  if (input.growthEnabled && !project.projectDomain) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Set the project's primary domain before enabling Growth.",
    );
  }

  const existing = await GrowthSettingsRepository.getByProjectId(
    project.projectId,
  );
  const keepsMonthlySchedule =
    input.growthEnabled &&
    input.reportCadence === "monthly" &&
    existing?.growthEnabled === true &&
    existing.reportCadence === "monthly" &&
    existing.reportTimezone === input.reportTimezone &&
    existing.reportDay === input.reportDay;
  const nextMonthlyReviewAt =
    keepsMonthlySchedule && existing.nextMonthlyReviewAt
      ? existing.nextMonthlyReviewAt
      : input.growthEnabled && input.reportCadence === "monthly"
        ? initialGrowthMonthlyReviewAt(
            now,
            input.reportTimezone,
            input.reportDay,
          )
        : null;
  const keepsWeeklySchedule =
    input.growthEnabled &&
    input.reportCadence === "weekly" &&
    existing?.growthEnabled === true &&
    existing.reportCadence === "weekly" &&
    existing.reportTimezone === input.reportTimezone &&
    existing.reportDay === input.reportDay;
  const nextWeeklyReviewAt =
    keepsWeeklySchedule && existing.nextWeeklyReviewAt
      ? existing.nextWeeklyReviewAt
      : input.growthEnabled && input.reportCadence === "weekly"
        ? initialGrowthWeeklyReviewAt(
            now,
            input.reportTimezone,
            input.reportDay,
          )
        : null;
  const row = await GrowthSettingsRepository.upsert(
    project.projectId,
    input,
    nextMonthlyReviewAt,
    nextWeeklyReviewAt,
  );
  const {
    nextMonthlyReviewAt: _schedule,
    nextWeeklyReviewAt: _weeklySchedule,
    settingsRevision: _revision,
    ...settings
  } = row;
  return { ...settings, persisted: true as const };
}

export const GrowthSettingsService = {
  getSettings,
  getSchedulingSettings,
  updateSettings,
} as const;
