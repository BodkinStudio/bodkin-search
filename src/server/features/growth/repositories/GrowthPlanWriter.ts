import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  growthActionEvents,
  growthActionEvidence,
  growthActionTargets,
  growthActions,
  growthEvidencePoints,
  growthEvidenceSeries,
  growthWorkstreams,
} from "@/db/schema";

type Workstream = typeof growthWorkstreams.$inferSelect;
type WorkstreamPatch = Partial<
  Pick<
    Workstream,
    | "title"
    | "commercialReason"
    | "status"
    | "targetLabel"
    | "targetBaseline"
    | "targetValue"
    | "targetDueOn"
  >
>;
type Actor = { actorType: "user" | "agent" | "system"; actorId: string };

type PlanEvidenceSeriesWrite = {
  kind: typeof growthEvidenceSeries.$inferSelect.kind;
  title: string;
  unit: string;
  points: {
    label: string;
    groupLabel: string | null;
    value: number | null;
  }[];
};

// Series and point ids are derived from the evidence id rather than minted, so
// a replay writes the same primary keys and every insert below no-ops instead
// of orphaning rows under an evidence row that was not re-inserted. Evidence
// ids are UUIDs or request-key UUIDs, so these stay well inside the DTO's
// 100-character id bound.
const seriesIdFor = (evidenceId: string) => `${evidenceId}:series`;
const pointIdFor = (evidenceId: string, position: number) =>
  `${evidenceId}:p${position}`;

type PlanActionEvidenceWrite = {
  id: string;
  kind: typeof growthActionEvidence.$inferSelect.kind;
  statement: string;
  sourceLabel: string;
  sourceUrl: string | null;
  observedOn: string | null;
  series: PlanEvidenceSeriesWrite | null;
};

/** The series and its points ride in the same batch as their evidence row. */
function evidenceSeriesStatements(
  tx: Parameters<Parameters<typeof runBatch>[0]>[0],
  projectId: string,
  evidenceId: string,
  series: PlanEvidenceSeriesWrite | null,
  createdAt: string,
) {
  if (!series) return [];
  const seriesId = seriesIdFor(evidenceId);
  return [
    tx
      .insert(growthEvidenceSeries)
      .values({
        id: seriesId,
        projectId,
        evidenceId,
        kind: series.kind,
        title: series.title,
        unit: series.unit,
        createdAt,
      })
      .onConflictDoNothing({ target: growthEvidenceSeries.id }),
    // Input order is the stored order.
    ...series.points.map((point, index) =>
      tx
        .insert(growthEvidencePoints)
        .values({
          id: pointIdFor(evidenceId, index + 1),
          projectId,
          seriesId,
          position: index + 1,
          label: point.label,
          groupLabel: point.groupLabel,
          value: point.value,
        })
        .onConflictDoNothing({ target: growthEvidencePoints.id }),
    ),
  ];
}

// Renumbering has to survive the (project_id, position) unique index on both
// engines, so every row is first parked far above the live 1..n range.
const REORDER_OFFSET = 10000;

// Next free slot, read inside the write statement. That is atomic on SQLite,
// where the statement takes the write lock; on Postgres two concurrent writers
// can both read the same MAX, and the loser raises a unique violation on the
// position index, which GrowthPlanService retries.
const nextWorkstreamPosition = (projectId: string) =>
  sql<number>`(SELECT COALESCE(MAX(${growthWorkstreams.position}), 0) + 1 FROM ${growthWorkstreams} WHERE ${growthWorkstreams.projectId} = ${projectId})`;

const nextActionPosition = (projectId: string, workstreamId: string) =>
  sql<number>`(SELECT COALESCE(MAX(${growthActions.workstreamPosition}), 0) + 1 FROM ${growthActions} WHERE ${growthActions.projectId} = ${projectId} AND ${growthActions.workstreamId} = ${workstreamId})`;

const nextEvidencePosition = (projectId: string, actionId: string) =>
  sql<number>`(SELECT COALESCE(MAX(${growthActionEvidence.position}), 0) + 1 FROM ${growthActionEvidence} WHERE ${growthActionEvidence.projectId} = ${projectId} AND ${growthActionEvidence.actionId} = ${actionId})`;

export async function insertWorkstream(
  input: {
    id: string;
    projectId: string;
    creationKey: string | null;
    title: string;
    commercialReason: string;
    targetLabel: string | null;
    targetBaseline: number | null;
    targetValue: number | null;
    targetDueOn: string | null;
  } & Actor,
) {
  const now = new Date().toISOString();
  await db
    .insert(growthWorkstreams)
    .values({
      id: input.id,
      projectId: input.projectId,
      creationKey: input.creationKey,
      position: nextWorkstreamPosition(input.projectId),
      title: input.title,
      commercialReason: input.commercialReason,
      status: "active",
      targetLabel: input.targetLabel,
      targetBaseline: input.targetBaseline,
      targetValue: input.targetValue,
      targetDueOn: input.targetDueOn,
      updatedBy: input.actorType,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [growthWorkstreams.projectId, growthWorkstreams.creationKey],
    });
}

export async function updateWorkstream(
  input: {
    projectId: string;
    workstreamId: string;
    patch: WorkstreamPatch;
  } & Actor,
) {
  await db
    .update(growthWorkstreams)
    .set({
      ...input.patch,
      updatedBy: input.actorType,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(growthWorkstreams.projectId, input.projectId),
        eq(growthWorkstreams.id, input.workstreamId),
      ),
    );
}

export async function deleteWorkstream(
  projectId: string,
  workstreamId: string,
) {
  await db
    .delete(growthWorkstreams)
    .where(
      and(
        eq(growthWorkstreams.projectId, projectId),
        eq(growthWorkstreams.id, workstreamId),
      ),
    );
}

export async function reorderWorkstreams(
  input: { projectId: string; orderedWorkstreamIds: string[] } & Actor,
) {
  const updatedAt = new Date().toISOString();
  await runBatch((tx) => [
    tx
      .update(growthWorkstreams)
      .set({ position: sql`${growthWorkstreams.position} + ${REORDER_OFFSET}` })
      .where(eq(growthWorkstreams.projectId, input.projectId)),
    ...input.orderedWorkstreamIds.map((workstreamId, index) =>
      tx
        .update(growthWorkstreams)
        .set({ position: index + 1, updatedBy: input.actorType, updatedAt })
        .where(
          and(
            eq(growthWorkstreams.projectId, input.projectId),
            eq(growthWorkstreams.id, workstreamId),
          ),
        ),
    ),
  ]);
}

export async function createPlanActionGraph(
  input: {
    id: string;
    projectId: string;
    workstreamId: string;
    creationKey: string;
    factHash: string;
    title: string;
    description: string;
    category: string;
    priorityScore: number;
    rationale: string;
    successMeasure: string | null;
    dueAt: string;
    targets: {
      targetType: "url" | "keyword" | "cluster" | "site";
      targetValue: string;
    }[];
    evidence: PlanActionEvidenceWrite[];
    eventId: string;
    eventFactHash: string;
  } & Actor,
) {
  const createdAt = new Date().toISOString();
  await runBatch((tx) => [
    tx
      .insert(growthActions)
      .values({
        id: input.id,
        projectId: input.projectId,
        recommendationId: null,
        workstreamId: input.workstreamId,
        workstreamPosition: nextActionPosition(
          input.projectId,
          input.workstreamId,
        ),
        rationale: input.rationale,
        successMeasure: input.successMeasure,
        creationKey: input.creationKey,
        factHash: input.factHash,
        title: input.title,
        description: input.description,
        category: input.category,
        priorityScore: input.priorityScore,
        status: "approved",
        stateVersion: 0,
        dueAt: input.dueAt,
        approvedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      })
      .onConflictDoNothing({
        target: [growthActions.projectId, growthActions.creationKey],
      }),
    ...input.targets.map((target) =>
      tx
        .insert(growthActionTargets)
        .values({
          projectId: input.projectId,
          actionId: input.id,
          targetType: target.targetType,
          targetValue: target.targetValue,
        })
        .onConflictDoNothing({
          target: [
            growthActionTargets.projectId,
            growthActionTargets.actionId,
            growthActionTargets.targetType,
            growthActionTargets.targetValue,
          ],
        }),
    ),
    ...input.evidence.flatMap(({ series, ...item }, index) => [
      tx
        .insert(growthActionEvidence)
        .values({
          ...item,
          projectId: input.projectId,
          actionId: input.id,
          position: index + 1,
          createdAt,
        })
        .onConflictDoNothing({
          target: [
            growthActionEvidence.projectId,
            growthActionEvidence.actionId,
            growthActionEvidence.position,
          ],
        }),
      ...evidenceSeriesStatements(
        tx,
        input.projectId,
        item.id,
        series,
        createdAt,
      ),
    ]),
    tx
      .insert(growthActionEvents)
      .values({
        id: input.eventId,
        projectId: input.projectId,
        actionId: input.id,
        actionVersion: 0,
        factHash: input.eventFactHash,
        eventType: "created",
        actorType: input.actorType,
        actorId: input.actorId,
        fromStatus: null,
        toStatus: "approved",
        note: null,
        createdAt,
      })
      .onConflictDoNothing({
        target: [
          growthActionEvents.projectId,
          growthActionEvents.actionId,
          growthActionEvents.actionVersion,
        ],
      }),
  ]);
}

export async function updatePlanAction(input: {
  projectId: string;
  actionId: string;
  patch: Partial<
    Pick<
      typeof growthActions.$inferSelect,
      "title" | "description" | "rationale" | "successMeasure" | "dueAt"
    >
  >;
  moveToWorkstreamId?: string;
}) {
  await db
    .update(growthActions)
    .set({
      ...input.patch,
      ...(input.moveToWorkstreamId
        ? {
            workstreamId: input.moveToWorkstreamId,
            workstreamPosition: nextActionPosition(
              input.projectId,
              input.moveToWorkstreamId,
            ),
          }
        : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(growthActions.projectId, input.projectId),
        eq(growthActions.id, input.actionId),
      ),
    );
}

export async function insertEvidence(
  input: PlanActionEvidenceWrite & { projectId: string; actionId: string },
) {
  const createdAt = new Date().toISOString();
  const { series, ...evidence } = input;
  await runBatch((tx) => [
    tx
      .insert(growthActionEvidence)
      .values({
        ...evidence,
        position: nextEvidencePosition(input.projectId, input.actionId),
        createdAt,
      })
      .onConflictDoNothing({ target: growthActionEvidence.id }),
    ...evidenceSeriesStatements(
      tx,
      input.projectId,
      input.id,
      series,
      createdAt,
    ),
  ]);
}

export async function deleteEvidence(
  projectId: string,
  actionId: string,
  evidenceId: string,
) {
  await db
    .delete(growthActionEvidence)
    .where(
      and(
        eq(growthActionEvidence.projectId, projectId),
        eq(growthActionEvidence.actionId, actionId),
        eq(growthActionEvidence.id, evidenceId),
      ),
    );
}
