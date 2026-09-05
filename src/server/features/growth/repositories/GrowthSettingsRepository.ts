import { and, asc, eq, exists, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { growthProjectSettings, projects } from "@/db/schema";
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
  nextMonthlyReviewAt: string | null = null,
): Promise<GrowthSettingsRow> {
  const now = new Date().toISOString();
  // Spell out the stored settings so a wider runtime object can never smuggle
  // a second projectId through the spread and override the authorized scope.
  const settings = {
    growthEnabled: input.growthEnabled,
    reportTimezone: input.reportTimezone,
    reportCadence: input.reportCadence,
    reportDay: input.reportDay,
    nextMonthlyReviewAt,
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
      settingsRevision: 1,
    })
    .onConflictDoUpdate({
      target: growthProjectSettings.projectId,
      set: {
        ...settings,
        updatedAt: now,
        settingsRevision: sql`${growthProjectSettings.settingsRevision} + 1`,
      },
    })
    .returning();

  if (!row) {
    throw new Error("Failed to upsert growth_project_settings");
  }
  return row;
}

async function listDueMonthlyReviews(now: string, limit: number) {
  return db
    .select({
      projectId: growthProjectSettings.projectId,
      reportTimezone: growthProjectSettings.reportTimezone,
      reportDay: growthProjectSettings.reportDay,
      nextMonthlyReviewAt: growthProjectSettings.nextMonthlyReviewAt,
      settingsRevision: growthProjectSettings.settingsRevision,
    })
    .from(growthProjectSettings)
    .innerJoin(projects, eq(projects.id, growthProjectSettings.projectId))
    .where(
      and(
        eq(growthProjectSettings.growthEnabled, true),
        eq(growthProjectSettings.reportCadence, "monthly"),
        isNull(projects.archivedAt),
        or(
          isNull(growthProjectSettings.nextMonthlyReviewAt),
          lte(growthProjectSettings.nextMonthlyReviewAt, now),
        ),
      ),
    )
    .orderBy(
      asc(growthProjectSettings.nextMonthlyReviewAt),
      asc(growthProjectSettings.projectId),
    )
    .limit(limit);
}

async function claimMonthlyReviewSchedule(input: {
  projectId: string;
  settingsRevision: number;
  observedAt: string | null;
  nextAt: string;
}) {
  const observed = input.observedAt
    ? eq(growthProjectSettings.nextMonthlyReviewAt, input.observedAt)
    : isNull(growthProjectSettings.nextMonthlyReviewAt);
  const [row] = await db
    .update(growthProjectSettings)
    .set({ nextMonthlyReviewAt: input.nextAt })
    .where(
      and(
        eq(growthProjectSettings.projectId, input.projectId),
        eq(growthProjectSettings.growthEnabled, true),
        eq(growthProjectSettings.reportCadence, "monthly"),
        eq(growthProjectSettings.settingsRevision, input.settingsRevision),
        observed,
        exists(
          db
            .select({ id: projects.id })
            .from(projects)
            .where(
              and(
                eq(projects.id, input.projectId),
                isNull(projects.archivedAt),
              ),
            ),
        ),
      ),
    )
    .returning({ projectId: growthProjectSettings.projectId });
  return Boolean(row);
}

export const GrowthSettingsRepository = {
  getByProjectId,
  upsert,
  listDueMonthlyReviews,
  claimMonthlyReviewSchedule,
} as const;
