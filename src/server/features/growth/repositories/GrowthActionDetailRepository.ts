import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import {
  growthActionChanges,
  growthActionEvents,
  growthActionTargets,
  growthActions,
  growthChangeEventUrls,
  growthChangeEvents,
  growthInsightSignals,
  growthInsights,
  growthRecommendationInsights,
  growthRecommendationSteps,
  growthRecommendationTargets,
  growthRecommendations,
  growthRuns,
  growthSignals,
} from "@/db/schema";

function codeUnit(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column} COLLATE "C"`
    : sql`${column} COLLATE BINARY`;
}
function atOrBefore(column: SQLWrapper, asOf: string) {
  // SQLite has both its default space timestamp and canonical ISO text in storage.
  return getDatabaseProvider() === "postgres"
    ? lte(column, asOf)
    : sql`julianday(${column}) <= julianday(${asOf})`;
}
function chronological(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? column
    : sql`julianday(${column})`;
}

async function getRoot(projectId: string, actionId: string) {
  const [row] = await db
    .select({
      action: {
        id: growthActions.id,
        title: growthActions.title,
        description: growthActions.description,
        category: growthActions.category,
        priorityScore: growthActions.priorityScore,
        status: growthActions.status,
        stateVersion: growthActions.stateVersion,
        dueAt: growthActions.dueAt,
        approvedAt: growthActions.approvedAt,
        startedAt: growthActions.startedAt,
        implementedAt: growthActions.implementedAt,
        evaluatedAt: growthActions.evaluatedAt,
        cancelledAt: growthActions.cancelledAt,
        createdAt: growthActions.createdAt,
        updatedAt: growthActions.updatedAt,
      },
      recommendation: {
        id: growthRecommendations.id,
        status: growthRecommendations.status,
        title: growthRecommendations.title,
        rationale: growthRecommendations.rationale,
        category: growthRecommendations.category,
        impact: growthRecommendations.impact,
        commercialRelevance: growthRecommendations.commercialRelevance,
        effort: growthRecommendations.effort,
        urgency: growthRecommendations.urgency,
        confidence: growthRecommendations.confidence,
        priorityScore: growthRecommendations.priorityScore,
        createdAt: growthRecommendations.createdAt,
        reviewedAt: growthRecommendations.reviewedAt,
      },
      run: {
        runType: growthRuns.runType,
        status: growthRuns.status,
        periodStart: growthRuns.periodStart,
        periodEnd: growthRuns.periodEnd,
        startedAt: growthRuns.startedAt,
        completedAt: growthRuns.completedAt,
      },
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
      growthRuns,
      and(
        eq(growthRuns.projectId, growthRecommendations.projectId),
        eq(growthRuns.id, growthRecommendations.runId),
      ),
    )
    .where(
      and(
        eq(growthActions.projectId, projectId),
        eq(growthActions.id, actionId),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function listActionTargets(projectId: string, actionId: string) {
  return db
    .select({
      targetType: growthActionTargets.targetType,
      targetValue: growthActionTargets.targetValue,
    })
    .from(growthActionTargets)
    .where(
      and(
        eq(growthActionTargets.projectId, projectId),
        eq(growthActionTargets.actionId, actionId),
      ),
    )
    .orderBy(
      codeUnit(growthActionTargets.targetType),
      codeUnit(growthActionTargets.targetValue),
    )
    .limit(21);
}
async function listHistory(projectId: string, actionId: string, asOf: string) {
  return db
    .select({
      actionVersion: growthActionEvents.actionVersion,
      eventType: growthActionEvents.eventType,
      fromStatus: growthActionEvents.fromStatus,
      toStatus: growthActionEvents.toStatus,
      note: growthActionEvents.note,
      createdAt: growthActionEvents.createdAt,
    })
    .from(growthActionEvents)
    .where(
      and(
        eq(growthActionEvents.projectId, projectId),
        eq(growthActionEvents.actionId, actionId),
        atOrBefore(growthActionEvents.createdAt, asOf),
      ),
    )
    .orderBy(desc(growthActionEvents.actionVersion))
    .limit(21);
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
    .where(
      and(
        eq(growthRecommendationTargets.projectId, projectId),
        eq(growthRecommendationTargets.recommendationId, recommendationId),
      ),
    )
    .orderBy(
      codeUnit(growthRecommendationTargets.targetType),
      codeUnit(growthRecommendationTargets.targetValue),
    )
    .limit(11);
}
async function listRecommendationSteps(
  projectId: string,
  recommendationId: string,
) {
  return db
    .select({ content: growthRecommendationSteps.content })
    .from(growthRecommendationSteps)
    .where(
      and(
        eq(growthRecommendationSteps.projectId, projectId),
        eq(growthRecommendationSteps.recommendationId, recommendationId),
      ),
    )
    .orderBy(growthRecommendationSteps.position)
    .limit(11);
}
async function listInsights(projectId: string, recommendationId: string) {
  return db
    .select({
      id: growthInsights.id,
      title: growthInsights.title,
      explanation: growthInsights.explanation,
      hypothesis: growthInsights.hypothesis,
      confidence: growthInsights.confidence,
      createdAt: growthInsights.createdAt,
    })
    .from(growthRecommendationInsights)
    .innerJoin(
      growthInsights,
      and(
        eq(growthInsights.projectId, growthRecommendationInsights.projectId),
        eq(growthInsights.runId, growthRecommendationInsights.runId),
        eq(growthInsights.id, growthRecommendationInsights.insightId),
      ),
    )
    .where(
      and(
        eq(growthRecommendationInsights.projectId, projectId),
        eq(growthRecommendationInsights.recommendationId, recommendationId),
      ),
    )
    .orderBy(codeUnit(growthInsights.id))
    .limit(6);
}
async function listSignals(projectId: string, insightIds: string[]) {
  if (!insightIds.length) return [];
  const ranked = db
    .select({
      insightId: growthInsightSignals.insightId,
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
      capturedAt: growthSignals.capturedAt,
      rank: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${growthInsightSignals.insightId} ORDER BY ${codeUnit(growthSignals.id)})`.as(
        "rank",
      ),
    })
    .from(growthInsightSignals)
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
        eq(growthInsightSignals.projectId, projectId),
        inArray(growthInsightSignals.insightId, insightIds),
      ),
    )
    .as("ranked_signals");
  return db
    .select()
    .from(ranked)
    .where(lte(ranked.rank, 6))
    .orderBy(codeUnit(ranked.insightId), sql`${ranked.rank}`);
}
async function listChanges(projectId: string, actionId: string, asOf: string) {
  return db
    .select({
      id: growthChangeEvents.id,
      source: growthChangeEvents.source,
      changeType: growthChangeEvents.changeType,
      description: growthChangeEvents.description,
      happenedAt: growthChangeEvents.happenedAt,
    })
    .from(growthActionChanges)
    .innerJoin(
      growthChangeEvents,
      and(
        eq(growthChangeEvents.projectId, growthActionChanges.projectId),
        eq(growthChangeEvents.id, growthActionChanges.changeEventId),
      ),
    )
    .where(
      and(
        eq(growthActionChanges.projectId, projectId),
        eq(growthActionChanges.actionId, actionId),
        atOrBefore(growthChangeEvents.createdAt, asOf),
        atOrBefore(growthChangeEvents.happenedAt, asOf),
      ),
    )
    .orderBy(
      desc(chronological(growthChangeEvents.happenedAt)),
      codeUnit(growthChangeEvents.id),
    )
    .limit(11);
}
async function listChangeUrls(projectId: string, changeIds: string[]) {
  if (!changeIds.length) return [];
  const ranked = db
    .select({
      changeEventId: growthChangeEventUrls.changeEventId,
      url: growthChangeEventUrls.url,
      rank: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${growthChangeEventUrls.changeEventId} ORDER BY ${codeUnit(growthChangeEventUrls.url)})`.as(
        "rank",
      ),
    })
    .from(growthChangeEventUrls)
    .where(
      and(
        eq(growthChangeEventUrls.projectId, projectId),
        inArray(growthChangeEventUrls.changeEventId, changeIds),
      ),
    )
    .as("ranked_change_urls");
  return db
    .select()
    .from(ranked)
    .where(lte(ranked.rank, 6))
    .orderBy(codeUnit(ranked.changeEventId), sql`${ranked.rank}`);
}
async function getDetail(projectId: string, actionId: string, asOf: string) {
  const root = await getRoot(projectId, actionId);
  if (!root) return null;
  const [
    actionTargets,
    history,
    recommendationTargets,
    steps,
    insights,
    changes,
  ] = await Promise.all([
    listActionTargets(projectId, actionId),
    listHistory(projectId, actionId, asOf),
    listRecommendationTargets(projectId, root.recommendation.id),
    listRecommendationSteps(projectId, root.recommendation.id),
    listInsights(projectId, root.recommendation.id),
    listChanges(projectId, actionId, asOf),
  ]);
  const [signals, urls] = await Promise.all([
    listSignals(
      projectId,
      insights.slice(0, 5).map(({ id }) => id),
    ),
    listChangeUrls(
      projectId,
      changes.slice(0, 10).map(({ id }) => id),
    ),
  ]);
  return {
    root,
    actionTargets,
    history,
    recommendationTargets,
    steps,
    insights,
    signals,
    changes,
    urls,
  };
}
export const GrowthActionDetailRepository = { getDetail } as const;
