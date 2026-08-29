import { and, eq, exists, sql } from "drizzle-orm";
import { runBatch } from "@/db/runBatch";
import {
  growthActions,
  growthChangeEvents,
  growthMeasurementPlans,
  growthMeasurementResultChanges,
  growthMeasurementResults,
} from "@/db/schema";
import { buildActionTransitionStatements } from "./GrowthActionsWriter";
import {
  allConfoundersExistSql,
  exactConfounderSetSql,
  exactObservationSetSql,
  lockForPostgres,
} from "./GrowthMeasurementsWriterSql";
import type {
  FinalizeMeasurementGraphInput,
  MeasurementOutcome,
} from "./GrowthMeasurementsWriterTypes";

export async function finalizeMeasurementGraph(
  input: FinalizeMeasurementGraphInput,
) {
  const uniqueObservationIds = new Set(input.observations.map(({ id }) => id));
  const uniqueConfounderIds = new Set(input.confoundingChangeEventIds);
  const validCoordinates =
    input.observations.length <= 150 &&
    uniqueObservationIds.size === input.observations.length &&
    input.confoundingChangeEventIds.length <= 50 &&
    uniqueConfounderIds.size === input.confoundingChangeEventIds.length;
  await runBatch((tx) => {
    // Acquire the Plan lock as its own first statement. PostgreSQL evaluates a
    // SELECT's WHERE clause before its row-lock node, so locking only the later
    // result INSERT ... SELECT could validate an Observation snapshot before a
    // concurrent observer releases its share lock. This statement establishes
    // the serialization point before any evidence is validated.
    const planLockSource = tx
      .select({ id: growthMeasurementPlans.id })
      .from(growthMeasurementPlans)
      .where(
        and(
          eq(growthMeasurementPlans.projectId, input.projectId),
          eq(growthMeasurementPlans.id, input.measurementPlanId),
          eq(growthMeasurementPlans.actionId, input.actionId),
          eq(growthMeasurementPlans.factHash, input.measurementPlanFactHash),
          eq(growthMeasurementPlans.status, "active"),
        ),
      );
    const planLock = lockForPostgres(planLockSource, "update");
    const confounderLocks = input.confoundingChangeEventIds.map(
      (changeEventId) => {
        const source = tx
          .select({ id: growthChangeEvents.id })
          .from(growthChangeEvents)
          .where(
            and(
              eq(growthChangeEvents.projectId, input.projectId),
              eq(growthChangeEvents.id, changeEventId),
            ),
          );
        return lockForPostgres(source, "share");
      },
    );
    const resultSource = tx
      .select({
        id: sql<string>`${input.id}`.as("id"),
        projectId: growthMeasurementPlans.projectId,
        measurementPlanId: growthMeasurementPlans.id,
        factHash: sql<string>`${input.factHash}`.as("fact_hash"),
        observationsHash: sql<string>`${input.observationsHash}`.as(
          "observations_hash",
        ),
        outcome: sql<MeasurementOutcome>`${input.outcome}`.as("outcome"),
        confidence: sql<number>`${input.confidence}`.as("confidence"),
        summary: sql<string>`${input.summary}`.as("summary"),
        evaluatedAt: sql<string>`${input.evaluatedAt}`.as("evaluated_at"),
        model: sql<string | null>`${input.model}`.as("model"),
        promptVersion: sql<string | null>`${input.promptVersion}`.as(
          "prompt_version",
        ),
        createdAt: sql<string>`${input.evaluatedAt}`.as("created_at"),
      })
      .from(growthMeasurementPlans)
      .innerJoin(
        growthActions,
        and(
          eq(growthActions.projectId, growthMeasurementPlans.projectId),
          eq(growthActions.id, growthMeasurementPlans.actionId),
        ),
      )
      .where(
        and(
          eq(growthMeasurementPlans.projectId, input.projectId),
          eq(growthMeasurementPlans.id, input.measurementPlanId),
          eq(growthMeasurementPlans.actionId, input.actionId),
          eq(growthMeasurementPlans.factHash, input.measurementPlanFactHash),
          eq(growthMeasurementPlans.status, "active"),
          eq(growthActions.status, "measuring"),
          eq(growthActions.stateVersion, input.expectedActionVersion),
          exactObservationSetSql(input),
          allConfoundersExistSql(input),
          sql`${validCoordinates}`,
        ),
      );
    const result = tx
      .insert(growthMeasurementResults)
      .select(lockForPostgres(resultSource, "update"))
      .onConflictDoNothing({
        target: [
          growthMeasurementResults.projectId,
          growthMeasurementResults.measurementPlanId,
        ],
      });
    const resultWinnerWhere = and(
      eq(growthMeasurementResults.projectId, input.projectId),
      eq(growthMeasurementResults.measurementPlanId, input.measurementPlanId),
      eq(growthMeasurementResults.id, input.id),
      eq(growthMeasurementResults.factHash, input.factHash),
      eq(growthMeasurementResults.observationsHash, input.observationsHash),
    );
    const changes = input.confoundingChangeEventIds.map((changeEventId) =>
      tx
        .insert(growthMeasurementResultChanges)
        .select(
          tx
            .select({
              projectId: growthMeasurementResults.projectId,
              measurementResultId: growthMeasurementResults.id,
              changeEventId: growthChangeEvents.id,
            })
            .from(growthMeasurementResults)
            .innerJoin(
              growthChangeEvents,
              and(
                eq(
                  growthChangeEvents.projectId,
                  growthMeasurementResults.projectId,
                ),
                eq(growthChangeEvents.id, changeEventId),
              ),
            )
            .where(resultWinnerWhere),
        )
        .onConflictDoNothing({
          target: [
            growthMeasurementResultChanges.projectId,
            growthMeasurementResultChanges.measurementResultId,
            growthMeasurementResultChanges.changeEventId,
          ],
        }),
    );
    const plan = tx
      .update(growthMeasurementPlans)
      .set({ status: "completed", completedAt: input.evaluatedAt })
      .where(
        and(
          eq(growthMeasurementPlans.projectId, input.projectId),
          eq(growthMeasurementPlans.id, input.measurementPlanId),
          eq(growthMeasurementPlans.actionId, input.actionId),
          eq(growthMeasurementPlans.factHash, input.measurementPlanFactHash),
          eq(growthMeasurementPlans.status, "active"),
          exists(
            tx
              .select({ value: sql<number>`1` })
              .from(growthMeasurementResults)
              .where(resultWinnerWhere),
          ),
          exactConfounderSetSql(input),
        ),
      );
    const transitionGuard = exists(
      tx
        .select({ value: sql<number>`1` })
        .from(growthMeasurementPlans)
        .innerJoin(
          growthMeasurementResults,
          and(
            eq(
              growthMeasurementResults.projectId,
              growthMeasurementPlans.projectId,
            ),
            eq(
              growthMeasurementResults.measurementPlanId,
              growthMeasurementPlans.id,
            ),
          ),
        )
        .where(
          and(
            eq(growthMeasurementPlans.projectId, input.projectId),
            eq(growthMeasurementPlans.id, input.measurementPlanId),
            eq(growthMeasurementPlans.actionId, input.actionId),
            eq(growthMeasurementPlans.factHash, input.measurementPlanFactHash),
            eq(growthMeasurementPlans.status, "completed"),
            eq(growthMeasurementPlans.completedAt, input.evaluatedAt),
            resultWinnerWhere,
          ),
        ),
    );
    const transition = buildActionTransitionStatements(
      tx,
      {
        projectId: input.projectId,
        actionId: input.actionId,
        expectedStatus: "measuring",
        expectedVersion: input.expectedActionVersion,
        status: "evaluated",
        eventId: input.eventId,
        eventFactHash: input.eventFactHash,
        actorType: input.actorType,
        actorId: input.actorId,
        note: input.note,
      },
      input.evaluatedAt,
      transitionGuard,
    );
    return [
      planLock,
      ...confounderLocks,
      result,
      ...changes,
      plan,
      ...transition,
    ];
  });
}
