import { and, eq, exists, sql } from "drizzle-orm";
import { getDatabaseProvider } from "@/db/provider";
import { runBatch } from "@/db/runBatch";
import {
  growthActions,
  growthMeasurementMetrics,
  growthMeasurementObservations,
  growthMeasurementPlans,
} from "@/db/schema";
import { buildActionTransitionStatements } from "./GrowthActionsWriter";
import { finalizeMeasurementGraph } from "./GrowthMeasurementFinalizationWriter";
import {
  exactMetricSetSql,
  lockForPostgres,
} from "./GrowthMeasurementsWriterSql";
import type {
  MeasurementComparisonMode,
  MeasurementEntityType,
  MeasurementEvidenceKind,
  MeasurementMetricType,
  MeasurementPeriodType,
  RecordMeasurementObservationInput,
  StartMeasurementGraphInput,
} from "./GrowthMeasurementsWriterTypes";

export type {
  FinalizeMeasurementGraphInput,
  RecordMeasurementObservationInput,
  StartMeasurementGraphInput,
} from "./GrowthMeasurementsWriterTypes";
export { finalizeMeasurementGraph };

export async function startMeasurementGraph(input: StartMeasurementGraphInput) {
  const occurredAt = new Date().toISOString();
  const actionVersion = input.expectedActionVersion + 1;
  const metricKeys = input.metrics.map(
    ({ metricType, entityType, entityKey }) =>
      `${metricType}\u0000${entityType}\u0000${entityKey}`,
  );
  const validMetricGraph =
    input.metrics.length > 0 &&
    input.metrics.length <= 50 &&
    new Set(metricKeys).size === input.metrics.length &&
    input.metrics.some(({ isPrimary }) => isPrimary);
  await runBatch((tx) => {
    const planSource = tx
      .select({
        id: sql<string>`${input.id}`.as("id"),
        projectId: growthActions.projectId,
        actionId: growthActions.id,
        factHash: sql<string>`${input.factHash}`.as("fact_hash"),
        status: sql<"active">`'active'`.as("status"),
        actionVersion: sql<number>`${actionVersion}`.as("action_version"),
        anchorAt: sql<string>`${growthActions.implementedAt}`.as("anchor_at"),
        anchorDate: sql<string>`${input.anchorDate}`.as("anchor_date"),
        reportTimezone: sql<string>`${input.reportTimezone}`.as(
          "report_timezone",
        ),
        baselineStart: sql<string>`${input.baselineStart}`.as("baseline_start"),
        baselineEnd: sql<string>`${input.baselineEnd}`.as("baseline_end"),
        cooldownEnd: sql<string>`${input.cooldownEnd}`.as("cooldown_end"),
        measurementStart: sql<string>`${input.measurementStart}`.as(
          "measurement_start",
        ),
        measurementEnd: sql<string>`${input.measurementEnd}`.as(
          "measurement_end",
        ),
        longMeasurementEnd: sql<string | null>`${input.longMeasurementEnd}`.as(
          "long_measurement_end",
        ),
        comparisonMode:
          sql<MeasurementComparisonMode>`${input.comparisonMode}`.as(
            "comparison_mode",
          ),
        completedAt: sql<null>`NULL`.as("completed_at"),
        createdAt: sql<string>`${occurredAt}`.as("created_at"),
      })
      .from(growthActions)
      .where(
        and(
          eq(growthActions.projectId, input.projectId),
          eq(growthActions.id, input.actionId),
          eq(growthActions.status, "implemented"),
          eq(growthActions.stateVersion, input.expectedActionVersion),
          eq(growthActions.implementedAt, input.anchorAt),
          sql`${validMetricGraph}`,
        ),
      );
    const plan = tx
      .insert(growthMeasurementPlans)
      .select(lockForPostgres(planSource, "update"))
      .onConflictDoNothing({
        target: [
          growthMeasurementPlans.projectId,
          growthMeasurementPlans.actionId,
        ],
      });
    const winnerWhere = and(
      eq(growthMeasurementPlans.projectId, input.projectId),
      eq(growthMeasurementPlans.actionId, input.actionId),
      eq(growthMeasurementPlans.factHash, input.factHash),
      eq(growthMeasurementPlans.actionVersion, actionVersion),
      eq(growthMeasurementPlans.anchorAt, input.anchorAt),
    );
    const metrics = input.metrics.map((metric) =>
      tx
        .insert(growthMeasurementMetrics)
        .select(
          tx
            .select({
              id: sql<string>`${metric.id}`.as("id"),
              projectId: growthMeasurementPlans.projectId,
              measurementPlanId: growthMeasurementPlans.id,
              metricType: sql<MeasurementMetricType>`${metric.metricType}`.as(
                "metric_type",
              ),
              entityType: sql<MeasurementEntityType>`${metric.entityType}`.as(
                "entity_type",
              ),
              entityKey: sql<string>`${metric.entityKey}`.as("entity_key"),
              isPrimary: sql<boolean>`${metric.isPrimary}`.as("is_primary"),
              createdAt: sql<string>`${occurredAt}`.as("created_at"),
            })
            .from(growthMeasurementPlans)
            .where(winnerWhere),
        )
        .onConflictDoNothing({
          target: [
            growthMeasurementMetrics.projectId,
            growthMeasurementMetrics.measurementPlanId,
            growthMeasurementMetrics.metricType,
            growthMeasurementMetrics.entityType,
            growthMeasurementMetrics.entityKey,
          ],
        }),
    );
    const transitionGuard = exists(
      tx
        .select({ value: sql<number>`1` })
        .from(growthMeasurementPlans)
        .where(and(winnerWhere, exactMetricSetSql(input))),
    );
    const transition = buildActionTransitionStatements(
      tx,
      {
        projectId: input.projectId,
        actionId: input.actionId,
        expectedStatus: "implemented",
        expectedVersion: input.expectedActionVersion,
        status: "measuring",
        eventId: input.eventId,
        eventFactHash: input.eventFactHash,
        actorType: input.actorType,
        actorId: input.actorId,
        note: input.note,
      },
      occurredAt,
      transitionGuard,
    );
    return [plan, ...metrics, ...transition];
  });
}

export async function recordMeasurementObservation(
  input: RecordMeasurementObservationInput,
) {
  const createdAt = new Date().toISOString();
  await runBatch((tx) => {
    const periodStart =
      input.periodType === "baseline"
        ? sql<string>`${growthMeasurementPlans.baselineStart}`
        : input.periodType === "measurement"
          ? sql<string>`${growthMeasurementPlans.measurementStart}`
          : getDatabaseProvider() === "postgres"
            ? sql<string>`to_char(to_date(${growthMeasurementPlans.measurementEnd}, 'YYYY-MM-DD') + 1, 'YYYY-MM-DD')`
            : sql<string>`date(${growthMeasurementPlans.measurementEnd}, '+1 day')`;
    const periodEnd =
      input.periodType === "baseline"
        ? sql<string>`${growthMeasurementPlans.baselineEnd}`
        : input.periodType === "measurement"
          ? sql<string>`${growthMeasurementPlans.measurementEnd}`
          : sql<string>`${growthMeasurementPlans.longMeasurementEnd}`;
    const source = tx
      .select({
        id: sql<string>`${input.id}`.as("id"),
        projectId: growthMeasurementMetrics.projectId,
        measurementPlanId: growthMeasurementMetrics.measurementPlanId,
        metricId: growthMeasurementMetrics.id,
        periodType: sql<MeasurementPeriodType>`${input.periodType}`.as(
          "period_type",
        ),
        factHash: sql<string>`${input.factHash}`.as("fact_hash"),
        effectiveStart: sql<string>`${input.effectiveStart}`.as(
          "effective_start",
        ),
        effectiveEnd: sql<string>`${input.effectiveEnd}`.as("effective_end"),
        value: sql<number>`${input.value}`.as("value"),
        completeness: sql<number>`${input.completeness}`.as("completeness"),
        evidenceKind: sql<MeasurementEvidenceKind>`${input.evidenceKind}`.as(
          "evidence_kind",
        ),
        evidenceRef: sql<string>`${input.evidenceRef}`.as("evidence_ref"),
        capturedAt: sql<string>`${input.capturedAt}`.as("captured_at"),
        createdAt: sql<string>`${createdAt}`.as("created_at"),
      })
      .from(growthMeasurementMetrics)
      .innerJoin(
        growthMeasurementPlans,
        and(
          eq(
            growthMeasurementPlans.projectId,
            growthMeasurementMetrics.projectId,
          ),
          eq(
            growthMeasurementPlans.id,
            growthMeasurementMetrics.measurementPlanId,
          ),
        ),
      )
      .where(
        and(
          eq(growthMeasurementPlans.projectId, input.projectId),
          eq(growthMeasurementPlans.id, input.measurementPlanId),
          eq(growthMeasurementPlans.status, "active"),
          eq(growthMeasurementMetrics.id, input.metricId),
          eq(periodStart, input.effectiveStart),
          eq(periodEnd, input.effectiveEnd),
        ),
      );
    const observation = tx
      .insert(growthMeasurementObservations)
      .select(lockForPostgres(source, "share"))
      .onConflictDoNothing({
        target: [
          growthMeasurementObservations.projectId,
          growthMeasurementObservations.measurementPlanId,
          growthMeasurementObservations.metricId,
          growthMeasurementObservations.periodType,
        ],
      });
    return [observation];
  });
}
