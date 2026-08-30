import { and, desc, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import { growthRuns, growthSignals, projects } from "@/db/schema";
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
  const now = new Date().toISOString();
  const inserted = await db
    .insert(growthRuns)
    .values({
      id,
      projectId: input.projectId,
      runType: input.runType,
      trigger: "manual",
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
    .select({
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
      createdAt: sql<string>`${now}`.as("created_at"),
    })
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

export const GrowthRunsRepository = {
  projectExists,
  getRun,
  listRuns,
  listRecentRuns,
  listRecentRunsForDetector,
  getRunBySlot,
  tryCreateManualRun,
  transitionRunningRun,
  setAnalysisVersionWhileRunning,
  getSignal,
  listSignals,
  tryRecordSignalWhileRunIsRunning,
} as const;
