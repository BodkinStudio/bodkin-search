import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  growthActionEvents,
  growthActions,
  growthActionTargets,
  growthRecommendations,
  growthRecommendationTargets,
  growthRecommendationInsights,
  growthInsightSignals,
  growthRuns,
  growthSignals,
  projects,
} from "@/db/schema";
import {
  approveActionGraph,
  createActionGraph,
  transitionAction,
} from "./GrowthActionsWriter";

async function getAction(projectId: string, id: string) {
  const [row] = await db
    .select()
    .from(growthActions)
    .where(
      and(eq(growthActions.projectId, projectId), eq(growthActions.id, id)),
    )
    .limit(1);
  return row ?? null;
}

async function getActionByKey(projectId: string, creationKey: string) {
  const [row] = await db
    .select()
    .from(growthActions)
    .where(
      and(
        eq(growthActions.projectId, projectId),
        eq(growthActions.creationKey, creationKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function getActionEvent(
  projectId: string,
  actionId: string,
  version: number,
) {
  const [row] = await db
    .select()
    .from(growthActionEvents)
    .where(
      and(
        eq(growthActionEvents.projectId, projectId),
        eq(growthActionEvents.actionId, actionId),
        eq(growthActionEvents.actionVersion, version),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listActionEvents(projectId: string, actionId: string) {
  return db
    .select()
    .from(growthActionEvents)
    .where(
      and(
        eq(growthActionEvents.projectId, projectId),
        eq(growthActionEvents.actionId, actionId),
      ),
    )
    .orderBy(growthActionEvents.actionVersion);
}

async function getActionGraph(projectId: string, id: string) {
  const action = await getAction(projectId, id);
  if (!action) return null;
  const [targets, events] = await Promise.all([
    db
      .select({
        targetType: growthActionTargets.targetType,
        targetValue: growthActionTargets.targetValue,
      })
      .from(growthActionTargets)
      .where(
        and(
          eq(growthActionTargets.projectId, projectId),
          eq(growthActionTargets.actionId, id),
        ),
      )
      .orderBy(growthActionTargets.targetType, growthActionTargets.targetValue),
    listActionEvents(projectId, id),
  ]);
  return { action, targets, events, creationEvent: events[0] ?? null };
}

async function getRecommendationSource(projectId: string, id: string) {
  const [row] = await db
    .select({
      id: growthRecommendations.id,
      projectId: growthRecommendations.projectId,
      runId: growthRecommendations.runId,
      status: growthRecommendations.status,
      reviewVersion: growthRecommendations.reviewVersion,
      category: growthRecommendations.category,
      priorityScore: growthRecommendations.priorityScore,
    })
    .from(growthRecommendations)
    .where(
      and(
        eq(growthRecommendations.projectId, projectId),
        eq(growthRecommendations.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listRecommendationTargets(
  projectId: string,
  recommendationId: string,
) {
  return db
    .select({
      targetType: growthRecommendationTargets.targetType,
      targetValue: growthRecommendationTargets.targetValue,
    })
    .from(growthRecommendationTargets)
    .innerJoin(
      growthRecommendations,
      and(
        eq(
          growthRecommendations.projectId,
          growthRecommendationTargets.projectId,
        ),
        eq(growthRecommendations.runId, growthRecommendationTargets.runId),
        eq(
          growthRecommendations.id,
          growthRecommendationTargets.recommendationId,
        ),
      ),
    )
    .where(
      and(
        eq(growthRecommendationTargets.projectId, projectId),
        eq(growthRecommendationTargets.recommendationId, recommendationId),
      ),
    )
    .orderBy(
      growthRecommendationTargets.targetType,
      growthRecommendationTargets.targetValue,
    );
}

async function projectDomain(projectId: string) {
  const [row] = await db
    .select({ domain: projects.domain })
    .from(projects)
    .where(and(eq(projects.id, projectId), sql`${projects.archivedAt} IS NULL`))
    .limit(1);
  return row?.domain ?? null;
}

async function listInvestigationWork(projectId: string, limit: number) {
  return db
    .select({
      id: growthActions.id,
      title: growthActions.title,
      status: growthActions.status,
      dueAt: growthActions.dueAt,
      createdAt: growthActions.createdAt,
      runId: growthRecommendations.runId,
    })
    .from(growthActions)
    .innerJoin(
      growthRecommendations,
      and(
        eq(growthRecommendations.projectId, growthActions.projectId),
        eq(growthRecommendations.id, growthActions.recommendationId),
      ),
    )
    .innerJoin(
      growthRecommendationInsights,
      and(
        eq(
          growthRecommendationInsights.projectId,
          growthRecommendations.projectId,
        ),
        eq(growthRecommendationInsights.runId, growthRecommendations.runId),
        eq(
          growthRecommendationInsights.recommendationId,
          growthRecommendations.id,
        ),
      ),
    )
    .innerJoin(
      growthInsightSignals,
      and(
        eq(
          growthInsightSignals.projectId,
          growthRecommendationInsights.projectId,
        ),
        eq(growthInsightSignals.runId, growthRecommendationInsights.runId),
        eq(
          growthInsightSignals.insightId,
          growthRecommendationInsights.insightId,
        ),
      ),
    )
    .innerJoin(
      growthRuns,
      and(
        eq(growthRuns.projectId, growthRecommendations.projectId),
        eq(growthRuns.id, growthRecommendations.runId),
      ),
    )
    .innerJoin(
      growthSignals,
      and(
        eq(growthSignals.projectId, growthInsightSignals.projectId),
        eq(growthSignals.runId, growthInsightSignals.runId),
        eq(growthSignals.id, growthInsightSignals.signalId),
      ),
    )
    .where(
      and(
        eq(growthActions.projectId, projectId),
        eq(growthRuns.runType, "manual_analysis"),
        eq(growthRuns.detectorVersion, "priority-page-click-decline-v1"),
        sql`${growthRuns.cadenceSlot} LIKE 'priority-page-check:%'`,
        sql`${growthRuns.status} IN ('completed', 'completed_with_errors')`,
        eq(growthSignals.signalType, "priority_page_click_decline"),
        eq(growthSignals.entityType, "key_page"),
        eq(growthSignals.metric, "gsc_clicks"),
        eq(growthSignals.evidenceKind, "gsc_period"),
        sql`${growthRecommendations.creationKey} = 'priority-page-investigation-v1:recommendation:' || ${growthInsightSignals.signalId}`,
        sql`${growthActions.creationKey} = 'priority-page-investigation-v1:action:' || ${growthInsightSignals.signalId}`,
      ),
    )
    .groupBy(
      growthActions.id,
      growthActions.title,
      growthActions.status,
      growthActions.dueAt,
      growthActions.createdAt,
      growthRecommendations.runId,
    )
    .orderBy(
      sql`${growthActions.createdAt} DESC`,
      sql`${growthActions.id} DESC`,
    )
    .limit(limit);
}

async function listActionTargetsForActions(
  projectId: string,
  actionIds: string[],
) {
  if (actionIds.length === 0) return [];
  return db
    .select({
      actionId: growthActionTargets.actionId,
      targetType: growthActionTargets.targetType,
      targetValue: growthActionTargets.targetValue,
    })
    .from(growthActionTargets)
    .where(
      and(
        eq(growthActionTargets.projectId, projectId),
        inArray(growthActionTargets.actionId, actionIds),
      ),
    )
    .orderBy(growthActionTargets.targetType, growthActionTargets.targetValue);
}

export const GrowthActionsRepository = {
  getAction,
  getActionByKey,
  getActionGraph,
  getActionEvent,
  listActionEvents,
  getRecommendationSource,
  listRecommendationTargets,
  projectDomain,
  listInvestigationWork,
  listActionTargetsForActions,
  createActionGraph,
  approveActionGraph,
  transitionAction,
} as const;
