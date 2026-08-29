import { eq } from "drizzle-orm";
import { db } from "@/db";
import { growthProjectSettings } from "@/db/schema";
import type { GrowthSettingsInput } from "@/types/schemas/growth";

export type GrowthSettingsRow = typeof growthProjectSettings.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<GrowthSettingsRow | null> {
  const [row] = await db
    .select()
    .from(growthProjectSettings)
    .where(eq(growthProjectSettings.projectId, projectId))
    .limit(1);
  return row ?? null;
}

async function upsert(
  projectId: string,
  input: GrowthSettingsInput,
): Promise<GrowthSettingsRow> {
  const now = new Date().toISOString();
  // Spell out the stored settings so a wider runtime object can never smuggle
  // a second projectId through the spread and override the authorized scope.
  const settings = {
    growthEnabled: input.growthEnabled,
    reportTimezone: input.reportTimezone,
    reportCadence: input.reportCadence,
    reportDay: input.reportDay,
    defaultBaselineDays: input.defaultBaselineDays,
    defaultCooldownDays: input.defaultCooldownDays,
    defaultPrimaryWindowDays: input.defaultPrimaryWindowDays,
    defaultLongWindowDays: input.defaultLongWindowDays,
  };
  const [row] = await db
    .insert(growthProjectSettings)
    .values({
      projectId,
      ...settings,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: growthProjectSettings.projectId,
      set: { ...settings, updatedAt: now },
    })
    .returning();

  if (!row) {
    throw new Error("Failed to upsert growth_project_settings");
  }
  return row;
}

export const GrowthSettingsRepository = {
  getByProjectId,
  upsert,
} as const;
