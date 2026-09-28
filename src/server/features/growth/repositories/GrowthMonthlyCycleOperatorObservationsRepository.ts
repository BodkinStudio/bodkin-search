import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import { runBatch, type BatchExecutor } from "@/db/runBatch";
import {
  growthMonthlyCycleOperatorObservations,
  growthRuns,
} from "@/db/schema";

function chronological(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`(${column})::timestamptz`
    : sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${column})`;
}
function codeUnitId(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column} COLLATE "C"`
    : sql`${column} COLLATE BINARY`;
}

export type AppendOperatorObservationRecord = {
  id: string;
  projectId: string;
  runId: string;
  requestKey: string;
  preparation: "not_assessed" | "none" | "minor" | "substantial";
  failure: "not_assessed" | "none_observed" | "explained" | "unexplained";
  duplicateSpam: "not_assessed" | "not_observed" | "observed";
  note: string | null;
  reviewerId: string;
  createdAt: string;
};

async function append(record: AppendOperatorObservationRecord) {
  const qualifiedSource = (tx: BatchExecutor) =>
    tx
      .select({
        id: sql<string>`${record.id}`.as("id"),
        projectId: growthRuns.projectId,
        runId: growthRuns.id,
        requestKey: sql<string>`${record.requestKey}`.as("request_key"),
        preparation: sql<
          AppendOperatorObservationRecord["preparation"]
        >`${record.preparation}`.as("preparation"),
        failure: sql<
          AppendOperatorObservationRecord["failure"]
        >`${record.failure}`.as("failure"),
        duplicateSpam: sql<
          AppendOperatorObservationRecord["duplicateSpam"]
        >`${record.duplicateSpam}`.as("duplicate_spam"),
        note: sql<string | null>`${record.note}`.as("note"),
        reviewerId: sql<string>`${record.reviewerId}`.as("reviewer_id"),
        createdAt: sql<string>`${record.createdAt}`.as("created_at"),
      })
      .from(growthRuns)
      .where(
        and(
          eq(growthRuns.projectId, record.projectId),
          eq(growthRuns.id, record.runId),
          eq(growthRuns.runType, "monthly_review"),
          eq(growthRuns.detectorVersion, "growth-monthly-review-v1"),
          sql`${growthRuns.status} IN ('completed', 'completed_with_errors', 'failed')`,
        ),
      );
  await runBatch((tx) => [
    tx
      .insert(growthMonthlyCycleOperatorObservations)
      .select(qualifiedSource(tx))
      .onConflictDoNothing({
        target: [
          growthMonthlyCycleOperatorObservations.projectId,
          growthMonthlyCycleOperatorObservations.requestKey,
        ],
      }),
  ]);
  const [saved] = await db
    .select()
    .from(growthMonthlyCycleOperatorObservations)
    .where(
      and(
        eq(growthMonthlyCycleOperatorObservations.projectId, record.projectId),
        eq(
          growthMonthlyCycleOperatorObservations.requestKey,
          record.requestKey,
        ),
      ),
    )
    .limit(1);
  return saved ?? null;
}

async function listLatestForRuns(projectId: string, runIds: readonly string[]) {
  if (!runIds.length) return [];
  if (runIds.length > 6)
    throw new Error("Monthly operator observation read exceeds its bound");
  const createdAt = chronological(
    growthMonthlyCycleOperatorObservations.createdAt,
  );
  const observationId = codeUnitId(growthMonthlyCycleOperatorObservations.id);
  const candidates = db
    .select({
      id: growthMonthlyCycleOperatorObservations.id,
      projectId: growthMonthlyCycleOperatorObservations.projectId,
      runId: growthMonthlyCycleOperatorObservations.runId,
      requestKey: growthMonthlyCycleOperatorObservations.requestKey,
      preparation: growthMonthlyCycleOperatorObservations.preparation,
      failure: growthMonthlyCycleOperatorObservations.failure,
      duplicateSpam: growthMonthlyCycleOperatorObservations.duplicateSpam,
      note: growthMonthlyCycleOperatorObservations.note,
      reviewerId: growthMonthlyCycleOperatorObservations.reviewerId,
      createdAt: growthMonthlyCycleOperatorObservations.createdAt,
      rowNumber:
        sql<number>`row_number() over (partition by ${growthMonthlyCycleOperatorObservations.runId} order by ${createdAt} desc, ${observationId} desc)`.as(
          "row_number",
        ),
    })
    .from(growthMonthlyCycleOperatorObservations)
    .where(
      and(
        eq(growthMonthlyCycleOperatorObservations.projectId, projectId),
        inArray(growthMonthlyCycleOperatorObservations.runId, [...runIds]),
      ),
    )
    .as("latest_monthly_operator_observation_candidates");
  return db
    .select({
      id: candidates.id,
      projectId: candidates.projectId,
      runId: candidates.runId,
      requestKey: candidates.requestKey,
      preparation: candidates.preparation,
      failure: candidates.failure,
      duplicateSpam: candidates.duplicateSpam,
      note: candidates.note,
      reviewerId: candidates.reviewerId,
      createdAt: candidates.createdAt,
    })
    .from(candidates)
    .where(eq(candidates.rowNumber, 1))
    .orderBy(
      desc(chronological(candidates.createdAt)),
      desc(codeUnitId(candidates.id)),
    );
}

export const GrowthMonthlyCycleOperatorObservationsRepository = {
  append,
  listLatestForRuns,
} as const;
