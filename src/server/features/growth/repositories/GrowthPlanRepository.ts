import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  growthActionEvidence,
  growthActionTargets,
  growthActions,
  growthEvidencePoints,
  growthEvidenceSeries,
  growthWorkstreams,
  keywordMetrics,
  projects,
  savedKeywords,
} from "@/db/schema";
import {
  createPlanActionGraph,
  deleteEvidence,
  deleteWorkstream,
  insertEvidence,
  insertWorkstream,
  reorderWorkstreams,
  updatePlanAction,
  updateWorkstream,
} from "./GrowthPlanWriter";

async function projectDomain(projectId: string) {
  const [row] = await db
    .select({ domain: projects.domain })
    .from(projects)
    .where(and(eq(projects.id, projectId), sql`${projects.archivedAt} IS NULL`))
    .limit(1);
  return row?.domain ?? null;
}

async function listWorkstreams(projectId: string) {
  return db
    .select()
    .from(growthWorkstreams)
    .where(eq(growthWorkstreams.projectId, projectId))
    .orderBy(asc(growthWorkstreams.position));
}

/** Every Action attached to a Workstream, plan-authored or promoted. */
async function listPlanActions(projectId: string) {
  return db
    .select({
      id: growthActions.id,
      workstreamId: growthActions.workstreamId,
      workstreamPosition: growthActions.workstreamPosition,
      recommendationId: growthActions.recommendationId,
      title: growthActions.title,
      description: growthActions.description,
      status: growthActions.status,
      stateVersion: growthActions.stateVersion,
      rationale: growthActions.rationale,
      successMeasure: growthActions.successMeasure,
      dueAt: growthActions.dueAt,
      createdAt: growthActions.createdAt,
      updatedAt: growthActions.updatedAt,
    })
    .from(growthActions)
    .where(
      and(
        eq(growthActions.projectId, projectId),
        isNotNull(growthActions.workstreamId),
      ),
    )
    .orderBy(asc(growthActions.createdAt));
}

/** Targets for one Action, or for every Action in the plan when no id is given. */
async function listActionTargets(projectId: string, actionId?: string) {
  return db
    .select({
      actionId: growthActionTargets.actionId,
      targetType: growthActionTargets.targetType,
      targetValue: growthActionTargets.targetValue,
    })
    .from(growthActionTargets)
    .innerJoin(
      growthActions,
      and(
        eq(growthActions.projectId, growthActionTargets.projectId),
        eq(growthActions.id, growthActionTargets.actionId),
      ),
    )
    .where(
      and(
        eq(growthActionTargets.projectId, projectId),
        actionId
          ? eq(growthActionTargets.actionId, actionId)
          : isNotNull(growthActions.workstreamId),
      ),
    );
}

async function listActionEvidence(projectId: string, actionId?: string) {
  return db
    .select()
    .from(growthActionEvidence)
    .where(
      and(
        eq(growthActionEvidence.projectId, projectId),
        actionId ? eq(growthActionEvidence.actionId, actionId) : undefined,
      ),
    )
    .orderBy(asc(growthActionEvidence.position));
}

/**
 * Saved search volume for plan keyword targets. Joined through saved_keywords so
 * only keywords the project actually saved are reported, newest fetch first;
 * location and language are deliberately not filtered.
 */
async function listSavedKeywordVolumes(projectId: string, keywords: string[]) {
  if (keywords.length === 0) return [];
  const normalized = sql<string>`lower(trim(${savedKeywords.keyword}))`;
  return db
    .select({
      keyword: normalized,
      searchVolume: keywordMetrics.searchVolume,
      fetchedAt: keywordMetrics.fetchedAt,
    })
    .from(savedKeywords)
    .innerJoin(
      keywordMetrics,
      and(
        eq(keywordMetrics.projectId, savedKeywords.projectId),
        eq(keywordMetrics.keyword, savedKeywords.keyword),
      ),
    )
    .where(
      and(
        eq(savedKeywords.projectId, projectId),
        inArray(normalized, keywords),
      ),
    )
    .orderBy(desc(keywordMetrics.fetchedAt));
}

/** One query for the plan's series, one for its points — never per evidence item. */
async function listEvidenceSeries(projectId: string, actionId?: string) {
  const query = db
    .select({
      id: growthEvidenceSeries.id,
      evidenceId: growthEvidenceSeries.evidenceId,
      kind: growthEvidenceSeries.kind,
      title: growthEvidenceSeries.title,
      unit: growthEvidenceSeries.unit,
    })
    .from(growthEvidenceSeries);
  if (!actionId)
    return query.where(eq(growthEvidenceSeries.projectId, projectId));
  return query
    .innerJoin(
      growthActionEvidence,
      and(
        eq(growthActionEvidence.projectId, growthEvidenceSeries.projectId),
        eq(growthActionEvidence.id, growthEvidenceSeries.evidenceId),
      ),
    )
    .where(
      and(
        eq(growthEvidenceSeries.projectId, projectId),
        eq(growthActionEvidence.actionId, actionId),
      ),
    );
}

async function listEvidencePoints(projectId: string, actionId?: string) {
  const query = db
    .select({
      seriesId: growthEvidencePoints.seriesId,
      position: growthEvidencePoints.position,
      label: growthEvidencePoints.label,
      groupLabel: growthEvidencePoints.groupLabel,
      value: growthEvidencePoints.value,
    })
    .from(growthEvidencePoints);
  const scoped = actionId
    ? query
        .innerJoin(
          growthEvidenceSeries,
          and(
            eq(growthEvidenceSeries.projectId, growthEvidencePoints.projectId),
            eq(growthEvidenceSeries.id, growthEvidencePoints.seriesId),
          ),
        )
        .innerJoin(
          growthActionEvidence,
          and(
            eq(growthActionEvidence.projectId, growthEvidenceSeries.projectId),
            eq(growthActionEvidence.id, growthEvidenceSeries.evidenceId),
          ),
        )
        .where(
          and(
            eq(growthEvidencePoints.projectId, projectId),
            eq(growthActionEvidence.actionId, actionId),
          ),
        )
    : query.where(eq(growthEvidencePoints.projectId, projectId));
  return scoped.orderBy(asc(growthEvidencePoints.position));
}

async function getWorkstream(projectId: string, workstreamId: string) {
  const [row] = await db
    .select()
    .from(growthWorkstreams)
    .where(
      and(
        eq(growthWorkstreams.projectId, projectId),
        eq(growthWorkstreams.id, workstreamId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function getWorkstreamByCreationKey(
  projectId: string,
  creationKey: string,
) {
  const [row] = await db
    .select()
    .from(growthWorkstreams)
    .where(
      and(
        eq(growthWorkstreams.projectId, projectId),
        eq(growthWorkstreams.creationKey, creationKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function countWorkstreamActions(projectId: string, workstreamId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(growthActions)
    .where(
      and(
        eq(growthActions.projectId, projectId),
        eq(growthActions.workstreamId, workstreamId),
      ),
    );
  return Number(row?.count ?? 0);
}

async function getAction(projectId: string, actionId: string) {
  const [row] = await db
    .select()
    .from(growthActions)
    .where(
      and(
        eq(growthActions.projectId, projectId),
        eq(growthActions.id, actionId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function getActionByCreationKey(projectId: string, creationKey: string) {
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

export const GrowthPlanRepository = {
  projectDomain,
  listWorkstreams,
  listPlanActions,
  listActionTargets,
  listActionEvidence,
  listEvidenceSeries,
  listEvidencePoints,
  listSavedKeywordVolumes,
  getWorkstream,
  getWorkstreamByCreationKey,
  insertWorkstream,
  updateWorkstream,
  countWorkstreamActions,
  deleteWorkstream,
  reorderWorkstreams,
  getAction,
  getActionByCreationKey,
  createPlanActionGraph,
  updatePlanAction,
  insertEvidence,
  deleteEvidence,
} as const;
