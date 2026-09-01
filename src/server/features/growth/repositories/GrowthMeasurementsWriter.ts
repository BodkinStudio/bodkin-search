import { and, eq, exists, ne, sql } from "drizzle-orm";
import { getDatabaseProvider } from "@/db/provider";
import { runBatch } from "@/db/runBatch";
import {
  growthActions,
  growthActionChanges,
  growthChangeEvents,
  growthMeasurementPlanAnchors,
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
  MeasurementMetricType,
  RecordMeasurementObservationInput,
  RecordMeasurementObservationsInput,
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
        anchorAt: growthChangeEvents.happenedAt,
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
      .innerJoin(
        growthActionChanges,
        and(
          eq(growthActionChanges.projectId, growthActions.projectId),
          eq(growthActionChanges.actionId, growthActions.id),
          eq(
            growthActionChanges.changeEventId,
            input.implementationChangeEventId,
          ),
        ),
      )
      .innerJoin(
        growthChangeEvents,
        and(
          eq(growthChangeEvents.projectId, growthActionChanges.projectId),
          eq(growthChangeEvents.id, growthActionChanges.changeEventId),
        ),
      )
      .where(
        and(
          eq(growthActions.projectId, input.projectId),
          eq(growthActions.id, input.actionId),
          eq(growthActions.status, "implemented"),
          eq(growthActions.stateVersion, input.expectedActionVersion),
          eq(growthChangeEvents.source, "manual"),
          eq(growthChangeEvents.happenedAt, input.anchorAt),
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
    const anchor = tx
      .insert(growthMeasurementPlanAnchors)
      .select(
        tx
          .select({
            projectId: growthMeasurementPlans.projectId,
            measurementPlanId: growthMeasurementPlans.id,
            actionId: growthMeasurementPlans.actionId,
            changeEventId: growthActionChanges.changeEventId,
          })
          .from(growthMeasurementPlans)
          .innerJoin(
            growthActionChanges,
            and(
              eq(
                growthActionChanges.projectId,
                growthMeasurementPlans.projectId,
              ),
              eq(growthActionChanges.actionId, growthMeasurementPlans.actionId),
              eq(
                growthActionChanges.changeEventId,
                input.implementationChangeEventId,
              ),
            ),
          )
          .innerJoin(
            growthChangeEvents,
            and(
              eq(growthChangeEvents.projectId, growthActionChanges.projectId),
              eq(growthChangeEvents.id, growthActionChanges.changeEventId),
            ),
          )
          .where(
            and(
              winnerWhere,
              eq(growthChangeEvents.source, "manual"),
              eq(growthChangeEvents.happenedAt, input.anchorAt),
            ),
          ),
      )
      .onConflictDoNothing({
        target: [
          growthMeasurementPlanAnchors.projectId,
          growthMeasurementPlanAnchors.measurementPlanId,
        ],
      });
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
        .innerJoin(
          growthMeasurementPlanAnchors,
          and(
            eq(
              growthMeasurementPlanAnchors.projectId,
              growthMeasurementPlans.projectId,
            ),
            eq(
              growthMeasurementPlanAnchors.measurementPlanId,
              growthMeasurementPlans.id,
            ),
            eq(
              growthMeasurementPlanAnchors.actionId,
              growthMeasurementPlans.actionId,
            ),
            eq(
              growthMeasurementPlanAnchors.changeEventId,
              input.implementationChangeEventId,
            ),
          ),
        )
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
    return [plan, anchor, ...metrics, ...transition];
  });
}

export async function recordMeasurementObservation(
  input: RecordMeasurementObservationInput,
) {
  await recordMeasurementObservations({ observations: [input] });
}

export async function recordMeasurementObservations(
  input: RecordMeasurementObservationsInput,
) {
  if (input.observations.length === 0) return;
  const createdAt = new Date().toISOString();
  await runBatch((tx) => {
    const [first] = input.observations;
    if (!first) return [];
    // The no-op update is a deliberate per-plan serialization point. On
    // Postgres it holds an UPDATE lock for the complete transaction; on D1 it
    // is the first ordered statement in the atomic batch.
    const lockPlan = tx
      .update(growthMeasurementPlans)
      .set({ status: sql`${growthMeasurementPlans.status}` })
      .where(
        and(
          eq(growthMeasurementPlans.projectId, first.projectId),
          eq(growthMeasurementPlans.id, first.measurementPlanId),
          eq(growthMeasurementPlans.status, "active"),
        ),
      );
    const payload = JSON.stringify(input.observations);
    const expected =
      getDatabaseProvider() === "postgres"
        ? sql`jsonb_array_elements(${payload}::jsonb) AS expected(value)`
        : sql`json_each(${payload}) AS expected`;
    const field = (name: string) =>
      getDatabaseProvider() === "postgres"
        ? sql<string>`expected.value->>${name}`
        : sql<string>`json_extract(expected.value, ${`$.${name}`})`;
    const numberField = (name: string) =>
      getDatabaseProvider() === "postgres"
        ? sql<number>`(${field(name)})::double precision`
        : sql<number>`json_extract(expected.value, ${`$.${name}`})`;
    const conflictGuard =
      // If a coordinate exists with a different fact hash, selecting that row
      // back into its own primary key deliberately fails before any insert.
      // This turns the provider attempt into one all-or-nothing batch on both
      // dialects. Exact existing facts select no rows and remain idempotent.
      tx.insert(growthMeasurementObservations).select(
        tx
          .select({
            id: growthMeasurementObservations.id,
            projectId: growthMeasurementObservations.projectId,
            measurementPlanId: growthMeasurementObservations.measurementPlanId,
            metricId: growthMeasurementObservations.metricId,
            periodType: growthMeasurementObservations.periodType,
            factHash: growthMeasurementObservations.factHash,
            effectiveStart: growthMeasurementObservations.effectiveStart,
            effectiveEnd: growthMeasurementObservations.effectiveEnd,
            value: growthMeasurementObservations.value,
            completeness: growthMeasurementObservations.completeness,
            evidenceKind: growthMeasurementObservations.evidenceKind,
            evidenceRef: growthMeasurementObservations.evidenceRef,
            capturedAt: growthMeasurementObservations.capturedAt,
            createdAt: growthMeasurementObservations.createdAt,
          })
          .from(growthMeasurementObservations)
          .innerJoin(expected, sql`true`)
          .where(
            and(
              eq(growthMeasurementObservations.projectId, field("projectId")),
              eq(
                growthMeasurementObservations.measurementPlanId,
                field("measurementPlanId"),
              ),
              eq(growthMeasurementObservations.metricId, field("metricId")),
              eq(growthMeasurementObservations.periodType, field("periodType")),
              ne(growthMeasurementObservations.factHash, field("factHash")),
            ),
          ),
      );
    const insert = (() => {
      const source = tx
        .select({
          id: field("id").as("id"),
          projectId: field("projectId").as("project_id"),
          measurementPlanId: field("measurementPlanId").as(
            "measurement_plan_id",
          ),
          metricId: field("metricId").as("metric_id"),
          periodType: field("periodType").as("period_type"),
          factHash: field("factHash").as("fact_hash"),
          effectiveStart: field("effectiveStart").as("effective_start"),
          effectiveEnd: field("effectiveEnd").as("effective_end"),
          value: numberField("value").as("value"),
          completeness: numberField("completeness").as("completeness"),
          evidenceKind: field("evidenceKind").as("evidence_kind"),
          evidenceRef: field("evidenceRef").as("evidence_ref"),
          capturedAt: field("capturedAt").as("captured_at"),
          createdAt: sql<string>`${createdAt}`.as("created_at"),
        })
        .from(expected)
        .innerJoin(
          growthMeasurementMetrics,
          and(
            eq(growthMeasurementMetrics.projectId, field("projectId")),
            eq(
              growthMeasurementMetrics.measurementPlanId,
              field("measurementPlanId"),
            ),
            eq(growthMeasurementMetrics.id, field("metricId")),
          ),
        )
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
            eq(growthMeasurementPlans.projectId, field("projectId")),
            eq(growthMeasurementPlans.id, field("measurementPlanId")),
            eq(growthMeasurementPlans.status, "active"),
            sql`CASE ${field("periodType")}
              WHEN 'baseline' THEN ${growthMeasurementPlans.baselineStart}
              WHEN 'measurement' THEN ${growthMeasurementPlans.measurementStart}
              ELSE ${getDatabaseProvider() === "postgres" ? sql`to_char(to_date(${growthMeasurementPlans.measurementEnd}, 'YYYY-MM-DD') + 1, 'YYYY-MM-DD')` : sql`date(${growthMeasurementPlans.measurementEnd}, '+1 day')`}
            END = ${field("effectiveStart")}`,
            sql`CASE ${field("periodType")}
              WHEN 'baseline' THEN ${growthMeasurementPlans.baselineEnd}
              WHEN 'measurement' THEN ${growthMeasurementPlans.measurementEnd}
              ELSE ${growthMeasurementPlans.longMeasurementEnd}
            END = ${field("effectiveEnd")}`,
          ),
        );
      return tx
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
    })();
    return [lockPlan, conflictGuard, insert];
  });
}
