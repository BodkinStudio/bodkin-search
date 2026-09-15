import { and, asc, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import {
  growthActions,
  growthMeasurementPlans,
  growthRecommendations,
  growthRuns,
  growthSignals,
} from "@/db/schema";

/** BINARY/C matches JavaScript code-unit ordering for server-created IDs. */
function codeUnitId(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column} COLLATE "C"`
    : sql`${column} COLLATE BINARY`;
}

async function listUnresolvedRecommendations(projectId: string, limit: number) {
  const recommendationId = codeUnitId(growthRecommendations.id);
  return db
    .select({
      id: growthRecommendations.id,
      title: growthRecommendations.title,
      rationale: growthRecommendations.rationale,
      category: growthRecommendations.category,
      impact: growthRecommendations.impact,
      commercialRelevance: growthRecommendations.commercialRelevance,
      effort: growthRecommendations.effort,
      urgency: growthRecommendations.urgency,
      confidence: growthRecommendations.confidence,
      priorityScore: growthRecommendations.priorityScore,
      status: growthRecommendations.status,
      snoozedUntil: growthRecommendations.snoozedUntil,
      createdAt: growthRecommendations.createdAt,
    })
    .from(growthRecommendations)
    .where(
      and(
        eq(growthRecommendations.projectId, projectId),
        or(
          eq(growthRecommendations.status, "proposed"),
          eq(growthRecommendations.status, "snoozed"),
          and(
            eq(growthRecommendations.status, "accepted"),
            sql`NOT EXISTS (
              SELECT 1
              FROM growth_actions AS summary_actions
              WHERE summary_actions.project_id = ${growthRecommendations.projectId}
                AND summary_actions.recommendation_id = ${growthRecommendations.id}
            )`,
          ),
        ),
      ),
    )
    .orderBy(
      desc(growthRecommendations.priorityScore),
      desc(growthRecommendations.createdAt),
      asc(recommendationId),
    )
    .limit(limit);
}

async function listCurrentActions(projectId: string, limit: number) {
  const actionId = codeUnitId(growthActions.id);
  return db
    .select({
      id: growthActions.id,
      title: growthActions.title,
      category: growthActions.category,
      priorityScore: growthActions.priorityScore,
      status: growthActions.status,
      stateVersion: growthActions.stateVersion,
      dueAt: growthActions.dueAt,
      updatedAt: growthActions.updatedAt,
    })
    .from(growthActions)
    .where(
      and(
        eq(growthActions.projectId, projectId),
        inArray(growthActions.status, [
          "approved",
          "ready",
          "in_progress",
          "blocked",
          "implemented",
          "measuring",
        ]),
      ),
    )
    .orderBy(
      desc(growthActions.priorityScore),
      asc(growthActions.dueAt),
      asc(actionId),
    )
    .limit(limit);
}

const terminalRunStatuses = ["completed", "completed_with_errors"] as const;

function terminalSignalRun(projectId: string, asOf: string) {
  return and(
    eq(growthSignals.projectId, projectId),
    eq(growthRuns.projectId, growthSignals.projectId),
    eq(growthRuns.id, growthSignals.runId),
    inArray(growthRuns.status, terminalRunStatuses),
    lte(growthRuns.completedAt, asOf),
    lte(growthSignals.capturedAt, asOf),
  );
}

function severityOrder() {
  return sql`CASE ${growthSignals.severity}
    WHEN 'critical' THEN 0
    WHEN 'warning' THEN 1
    WHEN 'info' THEN 2
    ELSE 3
  END`;
}

async function listRecentSignals(
  projectId: string,
  asOf: string,
  limit: number,
) {
  const signalId = codeUnitId(growthSignals.id);
  return db
    .select({
      id: growthSignals.id,
      signalType: growthSignals.signalType,
      entityType: growthSignals.entityType,
      metric: growthSignals.metric,
      severity: growthSignals.severity,
      confidence: growthSignals.confidence,
      periodStart: growthSignals.periodStart,
      periodEnd: growthSignals.periodEnd,
      baselineValue: growthSignals.baselineValue,
      currentValue: growthSignals.currentValue,
      deltaValue: growthSignals.deltaValue,
      deltaPercent: growthSignals.deltaPercent,
      evidenceKind: growthSignals.evidenceKind,
      capturedAt: growthSignals.capturedAt,
      runStatus: growthRuns.status,
    })
    .from(growthSignals)
    .innerJoin(growthRuns, terminalSignalRun(projectId, asOf))
    .orderBy(
      asc(severityOrder()),
      desc(growthSignals.capturedAt),
      asc(signalId),
    )
    .limit(limit);
}

/**
 * Evidence-only projection for AI priority generation. Keep this separate
 * from the compact summary contract consumed by the dashboard and MCP.
 */
async function listRecentSignalEvidence(
  projectId: string,
  asOf: string,
  limit: number,
) {
  const signalId = codeUnitId(growthSignals.id);
  return db
    .select({
      id: growthSignals.id,
      signalType: growthSignals.signalType,
      entityType: growthSignals.entityType,
      entityRef: growthSignals.entityRef,
      metric: growthSignals.metric,
      severity: growthSignals.severity,
      confidence: growthSignals.confidence,
      periodStart: growthSignals.periodStart,
      periodEnd: growthSignals.periodEnd,
      baselineValue: growthSignals.baselineValue,
      currentValue: growthSignals.currentValue,
      deltaValue: growthSignals.deltaValue,
      deltaPercent: growthSignals.deltaPercent,
      evidenceKind: growthSignals.evidenceKind,
      evidenceRef: growthSignals.evidenceRef,
      capturedAt: growthSignals.capturedAt,
      runStatus: growthRuns.status,
    })
    .from(growthSignals)
    .innerJoin(growthRuns, terminalSignalRun(projectId, asOf))
    .orderBy(
      asc(severityOrder()),
      desc(growthSignals.capturedAt),
      asc(signalId),
    )
    .limit(limit);
}

async function listSignalFreshness(projectId: string, asOf: string) {
  return db
    .select({
      evidenceKind: growthSignals.evidenceKind,
      capturedAt: sql<string>`max(${growthSignals.capturedAt})`,
    })
    .from(growthSignals)
    .innerJoin(growthRuns, terminalSignalRun(projectId, asOf))
    .groupBy(growthSignals.evidenceKind)
    .orderBy(asc(growthSignals.evidenceKind));
}

async function getLatestRun(projectId: string, asOf: string) {
  const runId = codeUnitId(growthRuns.id);
  const [row] = await db
    .select({
      id: growthRuns.id,
      runType: growthRuns.runType,
      trigger: growthRuns.trigger,
      status: growthRuns.status,
      periodStart: growthRuns.periodStart,
      periodEnd: growthRuns.periodEnd,
      startedAt: growthRuns.startedAt,
      completedAt: growthRuns.completedAt,
    })
    .from(growthRuns)
    .where(
      and(eq(growthRuns.projectId, projectId), lte(growthRuns.startedAt, asOf)),
    )
    .orderBy(desc(growthRuns.startedAt), asc(runId))
    .limit(1);
  return row ?? null;
}

async function listActiveMeasurementCandidates(
  projectId: string,
  limit: number,
) {
  const planId = codeUnitId(growthMeasurementPlans.id);
  return db
    .select({
      id: growthMeasurementPlans.id,
      actionId: growthMeasurementPlans.actionId,
      actionVersion: growthMeasurementPlans.actionVersion,
      reportTimezone: growthMeasurementPlans.reportTimezone,
      measurementEnd: growthMeasurementPlans.measurementEnd,
      longMeasurementEnd: growthMeasurementPlans.longMeasurementEnd,
      actionStatus: growthActions.status,
      actionStateVersion: growthActions.stateVersion,
      actionTitle: growthActions.title,
    })
    .from(growthMeasurementPlans)
    .leftJoin(
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
    )
    .orderBy(
      asc(
        sql`COALESCE(${growthMeasurementPlans.longMeasurementEnd}, ${growthMeasurementPlans.measurementEnd})`,
      ),
      asc(planId),
    )
    .limit(limit);
}

export const GrowthProjectSummaryRepository = {
  listUnresolvedRecommendations,
  listCurrentActions,
  listRecentSignals,
  listRecentSignalEvidence,
  listSignalFreshness,
  getLatestRun,
  listActiveMeasurementCandidates,
} as const;
