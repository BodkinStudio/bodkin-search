import { and, desc, eq, isNull, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import {
  growthActions,
  growthMeasurementPlans,
  growthProjectSettings,
  growthRuns,
  growthSignals,
  projects,
} from "@/db/schema";
import type {
  CreateManualGrowthRunInput,
  RecordGrowthSignalInput,
} from "@/types/schemas/growth";

export type GrowthRunRow = typeof growthRuns.$inferSelect;
export type GrowthSignalRow = typeof growthSignals.$inferSelect;

async function projectExists(projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return Boolean(row);
}

async function getRun(projectId: string, runId: string) {
  const [row] = await db
    .select()
    .from(growthRuns)
    .where(and(eq(growthRuns.projectId, projectId), eq(growthRuns.id, runId)))
    .limit(1);
  return row ?? null;
}

async function listRuns(projectId: string) {
  return db
    .select()
    .from(growthRuns)
    .where(eq(growthRuns.projectId, projectId))
    .orderBy(growthRuns.startedAt, growthRuns.id);
}

/** A deliberately small history read for interactive Growth surfaces. */
async function listRecentRuns(projectId: string, limit: number) {
  return db
    .select()
    .from(growthRuns)
    .where(eq(growthRuns.projectId, projectId))
    .orderBy(desc(growthRuns.startedAt), desc(growthRuns.id))
    .limit(limit);
}

async function listRecentRunsForDetector(
  projectId: string,
  runType: CreateManualGrowthRunInput["runType"],
  detectorVersion: string,
  cadenceSlotPrefix: string,
  limit: number,
) {
  return db
    .select()
    .from(growthRuns)
    .where(
      and(
        eq(growthRuns.projectId, projectId),
        eq(growthRuns.runType, runType),
        eq(growthRuns.detectorVersion, detectorVersion),
        like(growthRuns.cadenceSlot, `${cadenceSlotPrefix}%`),
      ),
    )
    .orderBy(desc(growthRuns.startedAt), desc(growthRuns.id))
    .limit(limit);
}

async function getRunBySlot(
  projectId: string,
  runType: CreateManualGrowthRunInput["runType"],
  cadenceSlot: string,
) {
  const [row] = await db
    .select()
    .from(growthRuns)
    .where(
      and(
        eq(growthRuns.projectId, projectId),
        eq(growthRuns.runType, runType),
        eq(growthRuns.cadenceSlot, cadenceSlot),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function tryCreateManualRun(
  input: CreateManualGrowthRunInput,
  id: string,
) {
  return tryCreateRun(input, id, "manual");
}

async function tryCreateScheduledRun(
  input: CreateManualGrowthRunInput,
  id: string,
  settingsRevision: number,
  reportCadence: "weekly" | "monthly",
) {
  const now = new Date().toISOString();
  const source = db
    .select({
      id: sql<string>`${id}`.as("id"),
      projectId: sql<string>`${input.projectId}`.as("project_id"),
      runType: sql<string>`${input.runType}`.as("run_type"),
      trigger: sql<string>`'scheduled'`.as("trigger"),
      status: sql<string>`'running'`.as("status"),
      cadenceSlot: sql<string>`${input.cadenceSlot}`.as("cadence_slot"),
      periodStart: sql<string>`${input.periodStart}`.as("period_start"),
      periodEnd: sql<string>`${input.periodEnd}`.as("period_end"),
      startedAt: sql<string>`${now}`.as("started_at"),
      completedAt: sql<null>`NULL`.as("completed_at"),
      detectorVersion: sql<string>`${input.detectorVersion}`.as(
        "detector_version",
      ),
      analysisVersion: sql<string | null>`${input.analysisVersion ?? null}`.as(
        "analysis_version",
      ),
      model: sql<string | null>`${input.model ?? null}`.as("model"),
      promptVersion: sql<string | null>`${input.promptVersion ?? null}`.as(
        "prompt_version",
      ),
      providerCostMinor: sql<null>`NULL`.as("provider_cost_minor"),
      failureCode: sql<null>`NULL`.as("failure_code"),
      failureMessage: sql<null>`NULL`.as("failure_message"),
    })
    .from(growthProjectSettings)
    .innerJoin(projects, eq(projects.id, growthProjectSettings.projectId))
    .where(
      and(
        eq(growthProjectSettings.projectId, input.projectId),
        eq(growthProjectSettings.growthEnabled, true),
        eq(growthProjectSettings.reportCadence, reportCadence),
        eq(growthProjectSettings.settingsRevision, settingsRevision),
        isNull(projects.archivedAt),
      ),
    );
  const inserted = await db
    .insert(growthRuns)
    .select(source)
    .onConflictDoNothing()
    .returning({ id: growthRuns.id });
  return Boolean(inserted[0]);
}

async function tryCreateRun(
  input: CreateManualGrowthRunInput,
  id: string,
  trigger: "manual" | "scheduled",
) {
  const now = new Date().toISOString();
  const inserted = await db
    .insert(growthRuns)
    .values({
      id,
      projectId: input.projectId,
      runType: input.runType,
      trigger,
      status: "running",
      cadenceSlot: input.cadenceSlot,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      startedAt: now,
      detectorVersion: input.detectorVersion,
      analysisVersion: input.analysisVersion ?? null,
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: growthRuns.id });
  return Boolean(inserted[0]);
}

async function transitionRunningRun(input: {
  projectId: string;
  runId: string;
  status: "completed" | "completed_with_errors" | "failed";
  providerCostMinor?: number | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}) {
  const [row] = await db
    .update(growthRuns)
    .set({
      status: input.status,
      completedAt: new Date().toISOString(),
      providerCostMinor: input.providerCostMinor ?? null,
      failureCode: input.failureCode ?? null,
      failureMessage: input.failureMessage ?? null,
    })
    .where(
      and(
        eq(growthRuns.projectId, input.projectId),
        eq(growthRuns.id, input.runId),
        eq(growthRuns.status, "running"),
      ),
    )
    .returning();
  return row ?? null;
}

async function setAnalysisVersionWhileRunning(input: {
  projectId: string;
  runId: string;
  analysisVersion: string;
}) {
  const [row] = await db
    .update(growthRuns)
    .set({ analysisVersion: input.analysisVersion })
    .where(
      and(
        eq(growthRuns.projectId, input.projectId),
        eq(growthRuns.id, input.runId),
        eq(growthRuns.status, "running"),
      ),
    )
    .returning();
  return row ?? null;
}

async function getSignal(projectId: string, signalId: string) {
  const [row] = await db
    .select()
    .from(growthSignals)
    .where(
      and(
        eq(growthSignals.projectId, projectId),
        eq(growthSignals.id, signalId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listSignals(projectId: string, runId: string) {
  return db
    .select()
    .from(growthSignals)
    .where(
      and(
        eq(growthSignals.projectId, projectId),
        eq(growthSignals.runId, runId),
      ),
    )
    .orderBy(growthSignals.createdAt, growthSignals.id);
}

function signalInsertProjection(
  input: RecordGrowthSignalInput,
  id: string,
  createdAt: string,
) {
  return {
    id: sql<string>`${id}`.as("id"),
    projectId: sql<string>`${input.projectId}`.as("project_id"),
    runId: sql<string>`${input.runId}`.as("run_id"),
    signalType: sql<string>`${input.signalType}`.as("signal_type"),
    entityType: sql<string>`${input.entityType}`.as("entity_type"),
    entityRef: sql<string>`${input.entityRef}`.as("entity_ref"),
    metric: sql<string>`${input.metric}`.as("metric"),
    severity: sql<string>`${input.severity}`.as("severity"),
    confidence: sql<number>`${input.confidence}`.as("confidence"),
    periodStart: sql<string>`${input.periodStart}`.as("period_start"),
    periodEnd: sql<string>`${input.periodEnd}`.as("period_end"),
    baselineValue: sql<number>`${input.baselineValue}`.as("baseline_value"),
    currentValue: sql<number>`${input.currentValue}`.as("current_value"),
    deltaValue: sql<number>`${input.deltaValue}`.as("delta_value"),
    deltaPercent: sql<number | null>`${input.deltaPercent ?? null}`.as(
      "delta_percent",
    ),
    evidenceKind: sql<string>`${input.evidenceKind}`.as("evidence_kind"),
    evidenceRef: sql<string>`${input.evidenceRef}`.as("evidence_ref"),
    capturedAt: sql<string>`${input.capturedAt}`.as("captured_at"),
    createdAt: sql<string>`${createdAt}`.as("created_at"),
  };
}

/**
 * Conditional INSERT keeps signal recording coupled to a running run in one
 * statement on both providers. A terminal transition that wins first prevents
 * this write; an insert that wins first is already committed before transition.
 */
async function tryRecordSignalWhileRunIsRunning(
  input: RecordGrowthSignalInput,
  id: string,
) {
  const now = new Date().toISOString();
  const source = db
    .select(signalInsertProjection(input, id, now))
    .from(growthRuns)
    .where(
      and(
        eq(growthRuns.id, input.runId),
        eq(growthRuns.projectId, input.projectId),
        eq(growthRuns.status, "running"),
      ),
    );
  // `db` is typed as D1, but resolves to the Postgres builder in that provider
  // branch. FOR SHARE conflicts with the terminal UPDATE's row lock.
  const postgresSource =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the provider guard below is the runtime proof for this deliberately narrower surface
    source as unknown as { for: (strength: "share") => typeof source };
  const lockedSource =
    getDatabaseProvider() === "postgres" ? postgresSource.for("share") : source;
  await db
    .insert(growthSignals)
    .select(lockedSource)
    .onConflictDoNothing({ target: growthSignals.id });
}

/**
 * Records a due Signal only while its Run, active Plan and exact measuring
 * Action version still agree. The joined rows are locked on Postgres so an
 * Action transition and this immutable fact cannot both claim to win first.
 */
async function tryRecordMeasurementDueSignalWhileEligible(
  input: RecordGrowthSignalInput,
  id: string,
  eligibility: {
    measurementPlanId: string;
    actionId: string;
    actionVersion: number;
  },
) {
  const now = new Date().toISOString();
  const source = db
    .select(signalInsertProjection(input, id, now))
    .from(growthRuns)
    .innerJoin(
      growthMeasurementPlans,
      and(
        eq(growthMeasurementPlans.projectId, input.projectId),
        eq(growthMeasurementPlans.id, eligibility.measurementPlanId),
        eq(growthMeasurementPlans.actionId, eligibility.actionId),
        eq(growthMeasurementPlans.actionVersion, eligibility.actionVersion),
        eq(growthMeasurementPlans.status, "active"),
      ),
    )
    .innerJoin(
      growthActions,
      and(
        eq(growthActions.projectId, growthMeasurementPlans.projectId),
        eq(growthActions.id, growthMeasurementPlans.actionId),
        eq(growthActions.status, "measuring"),
        eq(growthActions.stateVersion, growthMeasurementPlans.actionVersion),
      ),
    )
    .where(
      and(
        eq(growthRuns.id, input.runId),
        eq(growthRuns.projectId, input.projectId),
        eq(growthRuns.status, "running"),
      ),
    );
  // The provider guard is the runtime proof for this narrow Drizzle surface.
  const postgresSource =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Drizzle's D1 type does not expose Postgres row locks
    source as unknown as { for: (strength: "share") => typeof source };
  const lockedSource =
    getDatabaseProvider() === "postgres" ? postgresSource.for("share") : source;
  await db
    .insert(growthSignals)
    .select(lockedSource)
    .onConflictDoNothing({ target: growthSignals.id });
}

export const GrowthRunsRepository = {
  projectExists,
  getRun,
  listRuns,
  listRecentRuns,
  listRecentRunsForDetector,
  getRunBySlot,
  tryCreateManualRun,
  tryCreateScheduledRun,
  transitionRunningRun,
  setAnalysisVersionWhileRunning,
  getSignal,
  listSignals,
  tryRecordSignalWhileRunIsRunning,
  tryRecordMeasurementDueSignalWhileEligible,
} as const;
