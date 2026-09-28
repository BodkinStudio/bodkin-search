/* eslint-disable max-lines -- Action aggregate reads and provider-compatible guards remain one repository boundary */
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import type { GrowthActionsReadRequest } from "@/types/schemas/growth-action-reads";
import {
  growthActionEvents,
  growthActions,
  growthActionTargets,
  growthAiBriefs,
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
import {
  priorityPageInvestigationDescriptor,
  strikingDistanceInvestigationDescriptor,
  lowCtrInvestigationDescriptor,
  persistentRankDropInvestigationDescriptor,
  newCriticalAuditIssueInvestigationDescriptor,
  type GrowthInvestigationTemplateDescriptor,
} from "../services/GrowthInvestigationTemplateDescriptor";

/** BINARY/C matches JavaScript code-unit ordering for server-created Action IDs. */
function codeUnitId(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column} COLLATE "C"`
    : sql`${column} COLLATE BINARY`;
}

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

async function listRecentActionEvents(projectId: string, actionId: string) {
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
      ),
    )
    .orderBy(sql`${growthActionEvents.actionVersion} DESC`)
    .limit(50);
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

function investigationWorkGuard(
  descriptor: GrowthInvestigationTemplateDescriptor,
  requireAnalysisVersion: boolean,
  aiBrief = false,
) {
  return and(
    eq(growthRuns.runType, "manual_analysis"),
    inArray(growthRuns.detectorVersion, [...descriptor.run.detectorVersions]),
    sql`${growthRuns.cadenceSlot} LIKE ${`${descriptor.run.cadenceSlotPrefix}%`}`,
    requireAnalysisVersion
      ? eq(growthRuns.analysisVersion, descriptor.templateVersion)
      : undefined,
    sql`${growthRuns.status} IN ('completed', 'completed_with_errors')`,
    eq(growthSignals.signalType, descriptor.controller.signalType),
    eq(growthSignals.entityType, descriptor.controller.entityType),
    eq(growthSignals.metric, descriptor.controller.metric),
    eq(growthSignals.evidenceKind, descriptor.controller.evidenceKind),
    sql`${growthRecommendations.creationKey} = ${`${descriptor.templateVersion}:recommendation:`} || ${growthInsightSignals.signalId}`,
    aiBrief
      ? sql`${growthActions.creationKey} = ${"growth-ai-brief:action:"} || ${growthAiBriefs.id}`
      : sql`${growthActions.creationKey} = ${descriptor.actionKeyPrefix} || ${growthInsightSignals.signalId}`,
  );
}

function strikingCompanionGuard(
  metric: "gsc_clicks" | "gsc_impressions" | "gsc_average_position",
) {
  return sql`EXISTS (
    SELECT 1 FROM growth_insight_signals striking_companion_links
    JOIN growth_signals striking_companion
      ON striking_companion.project_id = striking_companion_links.project_id
      AND striking_companion.run_id = striking_companion_links.run_id
      AND striking_companion.id = striking_companion_links.signal_id
    WHERE striking_companion_links.project_id = growth_recommendations.project_id
      AND striking_companion_links.run_id = growth_recommendations.run_id
      AND striking_companion_links.insight_id = ${growthRecommendationInsights.insightId}
      AND striking_companion.metric = ${metric}
      AND striking_companion.signal_type = ${growthSignals.signalType}
      AND striking_companion.entity_type = ${growthSignals.entityType}
      AND striking_companion.entity_ref = ${growthSignals.entityRef}
      AND striking_companion.period_start = ${growthSignals.periodStart}
      AND striking_companion.period_end = ${growthSignals.periodEnd}
      AND striking_companion.captured_at = ${growthSignals.capturedAt}
      AND striking_companion.evidence_kind = ${growthSignals.evidenceKind}
      AND striking_companion.evidence_ref = ${growthSignals.evidenceRef}
      AND striking_companion.delta_value = striking_companion.current_value - striking_companion.baseline_value
  )`;
}

function strikingGraphGuard() {
  const descriptor = strikingDistanceInvestigationDescriptor;
  return and(
    sql`${growthSignals.deltaValue} = ${growthSignals.currentValue} - ${growthSignals.baselineValue}`,
    sql`(SELECT count(*) FROM growth_recommendation_insights striking_recommendation_insights
      WHERE striking_recommendation_insights.project_id = growth_recommendations.project_id
        AND striking_recommendation_insights.run_id = growth_recommendations.run_id
        AND striking_recommendation_insights.recommendation_id = growth_recommendations.id) = 1`,
    sql`EXISTS (
      SELECT 1 FROM growth_insights striking_insight
      WHERE striking_insight.project_id = growth_recommendations.project_id
        AND striking_insight.run_id = growth_recommendations.run_id
        AND striking_insight.id = ${growthRecommendationInsights.insightId}
        AND striking_insight.creation_key = ${`${descriptor.templateVersion}:insight:`} || ${growthInsightSignals.signalId}
    )`,
    sql`(SELECT count(*) FROM growth_insight_signals striking_signals
      WHERE striking_signals.project_id = growth_recommendations.project_id
        AND striking_signals.run_id = growth_recommendations.run_id
        AND striking_signals.insight_id = ${growthRecommendationInsights.insightId}) = ${1 + descriptor.companionMetrics.length}`,
    strikingCompanionGuard("gsc_clicks"),
    strikingCompanionGuard("gsc_average_position"),
  );
}

function lowCtrGraphGuard() {
  const descriptor = lowCtrInvestigationDescriptor;
  return and(
    sql`${growthSignals.deltaValue} = ${growthSignals.currentValue} - ${growthSignals.baselineValue}`,
    sql`(SELECT count(*) FROM growth_recommendation_insights low_ctr_recommendation_insights WHERE low_ctr_recommendation_insights.project_id = growth_recommendations.project_id AND low_ctr_recommendation_insights.run_id = growth_recommendations.run_id AND low_ctr_recommendation_insights.recommendation_id = growth_recommendations.id) = 1`,
    sql`EXISTS (SELECT 1 FROM growth_insights low_ctr_insight WHERE low_ctr_insight.project_id = growth_recommendations.project_id AND low_ctr_insight.run_id = growth_recommendations.run_id AND low_ctr_insight.id = ${growthRecommendationInsights.insightId} AND low_ctr_insight.creation_key = ${`${descriptor.templateVersion}:insight:`} || ${growthInsightSignals.signalId})`,
    sql`(SELECT count(*) FROM growth_insight_signals low_ctr_signals WHERE low_ctr_signals.project_id = growth_recommendations.project_id AND low_ctr_signals.run_id = growth_recommendations.run_id AND low_ctr_signals.insight_id = ${growthRecommendationInsights.insightId}) = ${1 + descriptor.companionMetrics.length}`,
    strikingCompanionGuard("gsc_clicks"),
    strikingCompanionGuard("gsc_impressions"),
    strikingCompanionGuard("gsc_average_position"),
  );
}

function persistentRankDropGraphGuard() {
  const descriptor = persistentRankDropInvestigationDescriptor;
  return and(
    sql`${growthSignals.deltaValue} = ${growthSignals.currentValue} - ${growthSignals.baselineValue}`,
    sql`(SELECT count(*) FROM growth_recommendation_insights rank_drop_recommendation_insights WHERE rank_drop_recommendation_insights.project_id = growth_recommendations.project_id AND rank_drop_recommendation_insights.run_id = growth_recommendations.run_id AND rank_drop_recommendation_insights.recommendation_id = growth_recommendations.id) = 1`,
    sql`EXISTS (SELECT 1 FROM growth_insights rank_drop_insight WHERE rank_drop_insight.project_id = growth_recommendations.project_id AND rank_drop_insight.run_id = growth_recommendations.run_id AND rank_drop_insight.id = ${growthRecommendationInsights.insightId} AND rank_drop_insight.creation_key = ${`${descriptor.templateVersion}:insight:`} || ${growthInsightSignals.signalId})`,
    sql`(SELECT count(*) FROM growth_insight_signals rank_drop_signals WHERE rank_drop_signals.project_id = growth_recommendations.project_id AND rank_drop_signals.run_id = growth_recommendations.run_id AND rank_drop_signals.insight_id = ${growthRecommendationInsights.insightId}) = 1`,
  );
}

function criticalAuditIssueGraphGuard() {
  const descriptor = newCriticalAuditIssueInvestigationDescriptor;
  return and(
    sql`${growthSignals.baselineValue} = 0`,
    sql`${growthSignals.currentValue} = 1`,
    sql`${growthSignals.deltaValue} = 1`,
    sql`${growthSignals.severity} = 'critical'`,
    sql`(SELECT count(*) FROM growth_recommendation_insights audit_issue_recommendation_insights WHERE audit_issue_recommendation_insights.project_id = growth_recommendations.project_id AND audit_issue_recommendation_insights.run_id = growth_recommendations.run_id AND audit_issue_recommendation_insights.recommendation_id = growth_recommendations.id) = 1`,
    sql`EXISTS (SELECT 1 FROM growth_insights audit_issue_insight WHERE audit_issue_insight.project_id = growth_recommendations.project_id AND audit_issue_insight.run_id = growth_recommendations.run_id AND audit_issue_insight.id = ${growthRecommendationInsights.insightId} AND audit_issue_insight.creation_key = ${`${descriptor.templateVersion}:insight:`} || ${growthInsightSignals.signalId})`,
    sql`(SELECT count(*) FROM growth_insight_signals audit_issue_signals WHERE audit_issue_signals.project_id = growth_recommendations.project_id AND audit_issue_signals.run_id = growth_recommendations.run_id AND audit_issue_signals.insight_id = ${growthRecommendationInsights.insightId}) = 1`,
  );
}

async function listInvestigationWork(
  projectId: string,
  limit: number,
  actionId?: string,
) {
  return db
    .select({
      id: growthActions.id,
      aiBriefSignalId: growthAiBriefs.signalId,
      title: growthActions.title,
      status: growthActions.status,
      stateVersion: growthActions.stateVersion,
      dueAt: growthActions.dueAt,
      createdAt: growthActions.createdAt,
      runId: growthRecommendations.runId,
    })
    .from(growthActions)
    .leftJoin(
      growthAiBriefs,
      and(
        eq(growthAiBriefs.projectId, growthActions.projectId),
        eq(growthAiBriefs.approvedActionId, growthActions.id),
      ),
    )
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
        actionId === undefined ? undefined : eq(growthActions.id, actionId),
        or(
          and(
            eq(growthAiBriefs.recommendationId, growthActions.recommendationId),
            eq(growthAiBriefs.signalId, growthInsightSignals.signalId),
            eq(growthAiBriefs.approvedVersion, growthAiBriefs.version),
            eq(growthRecommendations.status, "accepted"),
            or(
              and(
                eq(
                  growthAiBriefs.templateVersion,
                  priorityPageInvestigationDescriptor.templateVersion,
                ),
                investigationWorkGuard(
                  priorityPageInvestigationDescriptor,
                  false,
                  true,
                ),
              ),
              and(
                eq(
                  growthAiBriefs.templateVersion,
                  strikingDistanceInvestigationDescriptor.templateVersion,
                ),
                investigationWorkGuard(
                  strikingDistanceInvestigationDescriptor,
                  true,
                  true,
                ),
                strikingGraphGuard(),
              ),
            ),
          ),
          investigationWorkGuard(priorityPageInvestigationDescriptor, false),
          and(
            investigationWorkGuard(
              strikingDistanceInvestigationDescriptor,
              true,
            ),
            strikingGraphGuard(),
          ),
          and(
            investigationWorkGuard(lowCtrInvestigationDescriptor, true),
            lowCtrGraphGuard(),
          ),
          and(
            investigationWorkGuard(
              persistentRankDropInvestigationDescriptor,
              true,
            ),
            persistentRankDropGraphGuard(),
          ),
          and(
            investigationWorkGuard(
              newCriticalAuditIssueInvestigationDescriptor,
              true,
            ),
            criticalAuditIssueGraphGuard(),
          ),
        ),
      ),
    )
    .groupBy(
      growthActions.id,
      growthAiBriefs.signalId,
      growthActions.title,
      growthActions.status,
      growthActions.stateVersion,
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

/**
 * Project-leading, immutable creation-order source read for current Action
 * summaries. This intentionally does not reuse the narrower Work query.
 */
async function listActionsPage(input: GrowthActionsReadRequest) {
  const { projectId, statuses, category, minPriorityScore, limit, cursor } =
    input;
  const actionId = codeUnitId(growthActions.id);
  const afterCursor = cursor
    ? or(
        lt(growthActions.createdAt, cursor.createdAt),
        and(
          eq(growthActions.createdAt, cursor.createdAt),
          lt(actionId, cursor.id),
        ),
      )
    : undefined;
  return db
    .select({
      id: growthActions.id,
      title: growthActions.title,
      description: growthActions.description,
      category: growthActions.category,
      priorityScore: growthActions.priorityScore,
      status: growthActions.status,
      stateVersion: growthActions.stateVersion,
      dueAt: growthActions.dueAt,
      createdAt: growthActions.createdAt,
      updatedAt: growthActions.updatedAt,
    })
    .from(growthActions)
    .where(
      and(
        eq(growthActions.projectId, projectId),
        statuses === undefined
          ? undefined
          : inArray(growthActions.status, statuses),
        category === undefined
          ? undefined
          : eq(growthActions.category, category),
        minPriorityScore === undefined
          ? undefined
          : gte(growthActions.priorityScore, minPriorityScore),
        afterCursor,
      ),
    )
    .orderBy(desc(growthActions.createdAt), desc(actionId))
    .limit(limit + 1);
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

async function getApprovedAiBriefAction(
  projectId: string,
  signalId: string,
  recommendationId: string,
) {
  const [row] = await db
    .select({ action: growthActions })
    .from(growthAiBriefs)
    .innerJoin(
      growthActions,
      and(
        eq(growthAiBriefs.projectId, growthActions.projectId),
        eq(growthAiBriefs.approvedActionId, growthActions.id),
        eq(growthAiBriefs.recommendationId, growthActions.recommendationId),
      ),
    )
    .where(
      and(
        eq(growthAiBriefs.projectId, projectId),
        eq(growthAiBriefs.signalId, signalId),
        eq(growthAiBriefs.recommendationId, recommendationId),
        eq(growthAiBriefs.approvedVersion, growthAiBriefs.version),
        sql`${growthActions.creationKey} = ${"growth-ai-brief:action:"} || ${growthAiBriefs.id}`,
      ),
    )
    .limit(1);
  return row?.action ?? null;
}

export const GrowthActionsRepository = {
  getApprovedAiBriefAction,
  getAction,
  getActionByKey,
  getActionGraph,
  getActionEvent,
  listActionEvents,
  listRecentActionEvents,
  getRecommendationSource,
  listRecommendationTargets,
  projectDomain,
  listInvestigationWork,
  listActionsPage,
  listActionTargetsForActions,
  createActionGraph,
  approveActionGraph,
  transitionAction,
} as const;
