import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  growthActionEvents,
  growthActions,
  growthActionTargets,
  growthRecommendations,
  growthRecommendationTargets,
  projects,
} from "@/db/schema";
import { createActionGraph, transitionAction } from "./GrowthActionsWriter";

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

export const GrowthActionsRepository = {
  getAction,
  getActionByKey,
  getActionGraph,
  getActionEvent,
  listActionEvents,
  getRecommendationSource,
  listRecommendationTargets,
  projectDomain,
  createActionGraph,
  transitionAction,
} as const;
