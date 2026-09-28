import { and, desc, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db";
import {
  growthActions,
  growthAiBriefs,
  growthMeasurementPlans,
  growthRuns,
  growthSignals,
  projects,
} from "@/db/schema";

// The metric rows that belong with each source signal: a check writes one
// row per metric for the same run, check and subject.
async function signalFamilies(projectId: string, signalIds: string[]) {
  if (signalIds.length === 0) return { heads: [], rows: [] };
  const heads = await db
    .select({
      id: growthSignals.id,
      runId: growthSignals.runId,
      signalType: growthSignals.signalType,
      entityRef: growthSignals.entityRef,
      periodEnd: growthSignals.periodEnd,
    })
    .from(growthSignals)
    .where(
      and(
        eq(growthSignals.projectId, projectId),
        inArray(growthSignals.id, signalIds),
      ),
    );
  const runIds = [...new Set(heads.map((head) => head.runId))];
  const rows =
    runIds.length === 0
      ? []
      : await db
          .select({
            runId: growthSignals.runId,
            signalType: growthSignals.signalType,
            entityRef: growthSignals.entityRef,
            metric: growthSignals.metric,
            before: growthSignals.baselineValue,
            after: growthSignals.currentValue,
          })
          .from(growthSignals)
          .where(
            and(
              eq(growthSignals.projectId, projectId),
              inArray(growthSignals.runId, runIds),
            ),
          );
  return { heads, rows };
}

async function lastWatchAt(projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ startedAt: growthRuns.startedAt })
    .from(growthRuns)
    .where(
      and(
        eq(growthRuns.projectId, projectId),
        like(growthRuns.cadenceSlot, "%watch-%"),
      ),
    )
    .orderBy(desc(growthRuns.startedAt))
    .limit(1);
  return row?.startedAt ?? null;
}

async function activeMeasurements(projectId: string) {
  return db
    .select({
      actionId: growthMeasurementPlans.actionId,
      title: growthActions.title,
      anchorDate: growthMeasurementPlans.anchorDate,
      measurementEnd: growthMeasurementPlans.measurementEnd,
    })
    .from(growthMeasurementPlans)
    .innerJoin(
      growthActions,
      and(
        eq(growthActions.projectId, growthMeasurementPlans.projectId),
        eq(growthActions.id, growthMeasurementPlans.actionId),
      ),
    )
    .where(
      and(
        eq(growthMeasurementPlans.projectId, projectId),
        eq(growthMeasurementPlans.status, "active"),
      ),
    );
}

async function briefedSignalIds(projectId: string, signalIds: string[]) {
  if (signalIds.length === 0) return new Set<string>();
  const rows = await db
    .select({ signalId: growthAiBriefs.signalId })
    .from(growthAiBriefs)
    .where(
      and(
        eq(growthAiBriefs.projectId, projectId),
        inArray(growthAiBriefs.signalId, signalIds),
      ),
    );
  return new Set(rows.map((row) => row.signalId));
}

async function autoBriefSettings(projectId: string) {
  const [row] = await db
    .select({
      organizationId: projects.organizationId,
      enabled: projects.growthAutoBriefs,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row ?? null;
}

async function setAutoBriefs(projectId: string, enabled: boolean) {
  await db
    .update(projects)
    .set({ growthAutoBriefs: enabled })
    .where(eq(projects.id, projectId));
}

export const GrowthAnalystRepository = {
  signalFamilies,
  lastWatchAt,
  activeMeasurements,
  briefedSignalIds,
  autoBriefSettings,
  setAutoBriefs,
} as const;
