import { GrowthSettingsRepository } from "@/server/features/growth/repositories/GrowthSettingsRepository";
import { AppError } from "@/server/lib/errors";
import {
  GROWTH_SETTINGS_DEFAULTS,
  type GrowthSettingsInput,
} from "@/types/schemas/growth";

type AuthorizedProjectScope = {
  projectId: string;
  projectDomain: string | null;
};

export async function getSettings(projectId: string) {
  const row = await GrowthSettingsRepository.getByProjectId(projectId);
  if (row) return { ...row, persisted: true as const };

  return {
    projectId,
    ...GROWTH_SETTINGS_DEFAULTS,
    createdAt: null,
    updatedAt: null,
    persisted: false as const,
  };
}

export async function updateSettings(
  project: AuthorizedProjectScope,
  input: GrowthSettingsInput,
) {
  if (input.growthEnabled && !project.projectDomain) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Set the project's primary domain before enabling Growth.",
    );
  }

  const row = await GrowthSettingsRepository.upsert(project.projectId, input);
  return { ...row, persisted: true as const };
}

export const GrowthSettingsService = {
  getSettings,
  updateSettings,
} as const;
