import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  growthActionEvents,
  growthActions,
  growthActionChanges,
  growthChangeEvents,
  growthMeasurementPlanAnchors,
  growthMeasurementMetrics,
  growthMeasurementObservations,
  growthMeasurementPlans,
  growthMeasurementResultChanges,
  growthMeasurementResults,
  projects,
} from "@/db/schema";
import {
  finalizeMeasurementGraph,
  recordMeasurementObservation,
  recordMeasurementObservations,
  startMeasurementGraph,
} from "./GrowthMeasurementsWriter";

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

async function getMeasurementPlan(projectId: string, id: string) {
  const [row] = await db
    .select()
    .from(growthMeasurementPlans)
    .where(
      and(
        eq(growthMeasurementPlans.projectId, projectId),
        eq(growthMeasurementPlans.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function getMeasurementPlanByAction(projectId: string, actionId: string) {
  const [row] = await db
    .select()
    .from(growthMeasurementPlans)
    .where(
      and(
        eq(growthMeasurementPlans.projectId, projectId),
        eq(growthMeasurementPlans.actionId, actionId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function getMeasurementPlanAnchor(
  projectId: string,
  measurementPlanId: string,
) {
  const [row] = await db
    .select({
      implementationChangeEventId: growthMeasurementPlanAnchors.changeEventId,
      happenedAt: growthChangeEvents.happenedAt,
      source: growthChangeEvents.source,
    })
    .from(growthMeasurementPlanAnchors)
    .innerJoin(
      growthChangeEvents,
      and(
        eq(
          growthChangeEvents.projectId,
          growthMeasurementPlanAnchors.projectId,
        ),
        eq(growthChangeEvents.id, growthMeasurementPlanAnchors.changeEventId),
      ),
    )
    .where(
      and(
        eq(growthMeasurementPlanAnchors.projectId, projectId),
        eq(growthMeasurementPlanAnchors.measurementPlanId, measurementPlanId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function getLinkedManualChangeEvent(
  projectId: string,
  actionId: string,
  changeEventId: string,
) {
  const [row] = await db
    .select({ event: growthChangeEvents })
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
        eq(growthActionChanges.changeEventId, changeEventId),
        eq(growthChangeEvents.source, "manual"),
      ),
    )
    .limit(1);
  return row?.event ?? null;
}

async function getMeasurementMetric(
  projectId: string,
  measurementPlanId: string,
  metricId: string,
) {
  const [row] = await db
    .select()
    .from(growthMeasurementMetrics)
    .where(
      and(
        eq(growthMeasurementMetrics.projectId, projectId),
        eq(growthMeasurementMetrics.measurementPlanId, measurementPlanId),
        eq(growthMeasurementMetrics.id, metricId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listMeasurementMetrics(
  projectId: string,
  measurementPlanId: string,
) {
  return (
    db
      .select()
      .from(growthMeasurementMetrics)
      .where(
        and(
          eq(growthMeasurementMetrics.projectId, projectId),
          eq(growthMeasurementMetrics.measurementPlanId, measurementPlanId),
        ),
      )
      .orderBy(
        growthMeasurementMetrics.metricType,
        growthMeasurementMetrics.entityType,
        growthMeasurementMetrics.entityKey,
        growthMeasurementMetrics.id,
      )
      // Preserve this provider-default ordering: it is part of stored Plan facts.
      .limit(51)
  );
}

async function getMeasurementObservation(
  projectId: string,
  measurementPlanId: string,
  metricId: string,
  periodType: typeof growthMeasurementObservations.$inferSelect.periodType,
) {
  const [row] = await db
    .select()
    .from(growthMeasurementObservations)
    .where(
      and(
        eq(growthMeasurementObservations.projectId, projectId),
        eq(growthMeasurementObservations.measurementPlanId, measurementPlanId),
        eq(growthMeasurementObservations.metricId, metricId),
        eq(growthMeasurementObservations.periodType, periodType),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listMeasurementObservations(
  projectId: string,
  measurementPlanId: string,
) {
  return db
    .select()
    .from(growthMeasurementObservations)
    .where(
      and(
        eq(growthMeasurementObservations.projectId, projectId),
        eq(growthMeasurementObservations.measurementPlanId, measurementPlanId),
      ),
    )
    .orderBy(
      growthMeasurementObservations.metricId,
      sql`CASE ${growthMeasurementObservations.periodType}
        WHEN 'baseline' THEN 0 WHEN 'measurement' THEN 1 ELSE 2 END`,
      growthMeasurementObservations.id,
    )
    .limit(151);
}

async function getMeasurementResult(
  projectId: string,
  measurementPlanId: string,
) {
  const [row] = await db
    .select()
    .from(growthMeasurementResults)
    .where(
      and(
        eq(growthMeasurementResults.projectId, projectId),
        eq(growthMeasurementResults.measurementPlanId, measurementPlanId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listMeasurementResultChangeEventIds(
  projectId: string,
  measurementResultId: string,
) {
  const rows = await db
    .select({ changeEventId: growthMeasurementResultChanges.changeEventId })
    .from(growthMeasurementResultChanges)
    .where(
      and(
        eq(growthMeasurementResultChanges.projectId, projectId),
        eq(
          growthMeasurementResultChanges.measurementResultId,
          measurementResultId,
        ),
      ),
    )
    .orderBy(growthMeasurementResultChanges.changeEventId)
    .limit(51);
  return rows.map(({ changeEventId }) => changeEventId);
}

async function listMeasurementActionEvents(
  projectId: string,
  actionId: string,
  actionVersion: number,
) {
  return db
    .select()
    .from(growthActionEvents)
    .where(
      and(
        eq(growthActionEvents.projectId, projectId),
        eq(growthActionEvents.actionId, actionId),
        inArray(growthActionEvents.actionVersion, [
          actionVersion,
          actionVersion + 1,
        ]),
      ),
    )
    .orderBy(growthActionEvents.actionVersion);
}

async function getMeasurementGraph(projectId: string, id: string) {
  const plan = await getMeasurementPlan(projectId, id);
  if (!plan) return null;
  const [metrics, observations, result, actionEvents, anchor] =
    await Promise.all([
      listMeasurementMetrics(projectId, id),
      listMeasurementObservations(projectId, id),
      getMeasurementResult(projectId, id),
      listMeasurementActionEvents(projectId, plan.actionId, plan.actionVersion),
      getMeasurementPlanAnchor(projectId, id),
    ]);
  const confoundingChangeEventIds = result
    ? await listMeasurementResultChangeEventIds(projectId, result.id)
    : [];
  return {
    plan,
    implementationChangeEventId: anchor?.implementationChangeEventId ?? null,
    implementationChangeEventHappenedAt: anchor?.happenedAt ?? null,
    implementationChangeEventSource: anchor?.source ?? null,
    metrics,
    observations,
    result,
    confoundingChangeEventIds,
    actionEvents,
  };
}

async function projectDomain(projectId: string) {
  const [row] = await db
    .select({ domain: projects.domain })
    .from(projects)
    .where(and(eq(projects.id, projectId), sql`${projects.archivedAt} IS NULL`))
    .limit(1);
  return row?.domain ?? null;
}

async function listChangeEventsByIds(projectId: string, ids: string[]) {
  const sortedIds = ids.toSorted((left, right) => left.localeCompare(right));
  const rows = await Promise.all(
    sortedIds.map(async (id) => {
      const [row] = await db
        .select()
        .from(growthChangeEvents)
        .where(
          and(
            eq(growthChangeEvents.projectId, projectId),
            eq(growthChangeEvents.id, id),
          ),
        )
        .limit(1);
      return row ?? null;
    }),
  );
  return rows.filter((row) => row !== null);
}

export const GrowthMeasurementsRepository = {
  getAction,
  getMeasurementPlan,
  getMeasurementPlanByAction,
  getMeasurementPlanAnchor,
  getLinkedManualChangeEvent,
  getMeasurementMetric,
  listMeasurementMetrics,
  getMeasurementObservation,
  listMeasurementObservations,
  getMeasurementResult,
  listMeasurementResultChangeEventIds,
  listMeasurementActionEvents,
  getMeasurementGraph,
  projectDomain,
  startMeasurementGraph,
  recordMeasurementObservation,
  recordMeasurementObservations,
  finalizeMeasurementGraph,
  getPlan: getMeasurementPlan,
  getPlanByAction: getMeasurementPlanByAction,
  getMetric: getMeasurementMetric,
  listMetrics: listMeasurementMetrics,
  getObservationByCoordinate: getMeasurementObservation,
  listObservations: listMeasurementObservations,
  getResultByPlan: getMeasurementResult,
  listResultChangeIds: listMeasurementResultChangeEventIds,
  getGraph: getMeasurementGraph,
  listChangeEventsByIds,
} as const;
