/* eslint-disable max-lines -- Action creation, review and optional brief linkage are one atomic aggregate */
import { and, eq, exists, sql, type SQL } from "drizzle-orm";
import { getDatabaseProvider } from "@/db/provider";
import { runBatch, type BatchExecutor } from "@/db/runBatch";
import {
  growthActionEvents,
  growthAiBriefs,
  growthActions,
  growthActionTargets,
  growthRecommendations,
  growthRecommendationTargets,
} from "@/db/schema";
import { buildRecommendationReviewStatement } from "./GrowthInsightsRepository";

type ActionStatus = typeof growthActions.$inferSelect.status;
type ActionTarget = {
  targetType: "url" | "keyword" | "cluster" | "site";
  targetValue: string;
};
type ActionActorType = typeof growthActionEvents.$inferSelect.actorType;

type CreateActionGraphInput = {
  id: string;
  projectId: string;
  runId: string;
  recommendationId: string;
  creationKey: string;
  factHash: string;
  title: string;
  description: string;
  dueAt: string;
  category: string;
  priorityScore: number;
  targets: ActionTarget[];
  eventId: string;
  eventFactHash: string;
  actorType: ActionActorType;
  actorId: string;
  note: string | null;
  aiBriefApproval?: {
    briefId: string;
    expectedVersion: number;
    dueOn: string;
    actorId: string;
  };
};

function buildActionCreationStatements(
  tx: BatchExecutor,
  input: CreateActionGraphInput,
  createdAt: string,
  expectedReviewVersion?: number,
) {
  const source = tx
    .select({
      id: sql<string>`${input.id}`.as("id"),
      projectId: growthRecommendations.projectId,
      recommendationId: growthRecommendations.id,
      creationKey: sql<string>`${input.creationKey}`.as("creation_key"),
      factHash: sql<string>`${input.factHash}`.as("fact_hash"),
      title: sql<string>`${input.title}`.as("title"),
      description: sql<string>`${input.description}`.as("description"),
      category: growthRecommendations.category,
      priorityScore: growthRecommendations.priorityScore,
      status: sql<"approved">`'approved'`.as("status"),
      stateVersion: sql<number>`0`.as("state_version"),
      ownerUserId: sql<null>`NULL`.as("owner_user_id"),
      dueAt: sql<string>`${input.dueAt}`.as("due_at"),
      approvedAt: sql<string>`${createdAt}`.as("approved_at"),
      startedAt: sql<null>`NULL`.as("started_at"),
      implementedAt: sql<null>`NULL`.as("implemented_at"),
      evaluatedAt: sql<null>`NULL`.as("evaluated_at"),
      cancelledAt: sql<null>`NULL`.as("cancelled_at"),
      createdAt: sql<string>`${createdAt}`.as("created_at"),
      updatedAt: sql<string>`${createdAt}`.as("updated_at"),
      // An Action born from a Recommendation carries no plan fields; the
      // projection must still list every column, in table order.
      workstreamId: sql<null>`NULL`.as("workstream_id"),
      workstreamPosition: sql<null>`NULL`.as("workstream_position"),
      rationale: sql<null>`NULL`.as("rationale"),
      successMeasure: sql<null>`NULL`.as("success_measure"),
    })
    .from(growthRecommendations)
    .where(
      and(
        eq(growthRecommendations.projectId, input.projectId),
        eq(growthRecommendations.runId, input.runId),
        eq(growthRecommendations.id, input.recommendationId),
        eq(
          growthRecommendations.status,
          expectedReviewVersion === undefined ? "accepted" : "proposed",
        ),
        expectedReviewVersion === undefined
          ? undefined
          : eq(growthRecommendations.reviewVersion, expectedReviewVersion),
        eq(growthRecommendations.category, input.category),
        eq(growthRecommendations.priorityScore, input.priorityScore),
        input.aiBriefApproval
          ? exists(
              tx
                .select({ value: sql`1` })
                .from(growthAiBriefs)
                .where(
                  and(
                    eq(growthAiBriefs.projectId, input.projectId),
                    eq(growthAiBriefs.id, input.aiBriefApproval.briefId),
                    eq(growthAiBriefs.recommendationId, input.recommendationId),
                    eq(
                      growthAiBriefs.version,
                      input.aiBriefApproval.expectedVersion,
                    ),
                    eq(growthAiBriefs.proposalWriteKey, input.id),
                    sql`${growthAiBriefs.approvedActionId} IS NULL`,
                  ),
                ),
            )
          : undefined,
        sql`${input.targets.length} > 0`,
        ...input.targets.map((target) =>
          exists(
            tx
              .select({ value: sql<number>`1` })
              .from(growthRecommendationTargets)
              .where(
                and(
                  eq(
                    growthRecommendationTargets.projectId,
                    growthRecommendations.projectId,
                  ),
                  eq(
                    growthRecommendationTargets.runId,
                    growthRecommendations.runId,
                  ),
                  eq(
                    growthRecommendationTargets.recommendationId,
                    growthRecommendations.id,
                  ),
                  eq(growthRecommendationTargets.targetType, target.targetType),
                  eq(
                    growthRecommendationTargets.targetValue,
                    target.targetValue,
                  ),
                ),
              ),
          ),
        ),
      ),
    );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the provider guard proves this narrower Postgres builder surface
  const postgresSource = source as unknown as {
    for: (strength: "share" | "update") => typeof source;
  };
  const lockedSource =
    getDatabaseProvider() === "postgres"
      ? postgresSource.for(
          expectedReviewVersion === undefined ? "share" : "update",
        )
      : source;
  const parent = tx
    .insert(growthActions)
    .select(lockedSource)
    .onConflictDoNothing({
      target: [growthActions.projectId, growthActions.creationKey],
    });

  const parentWhere = and(
    eq(growthActions.projectId, input.projectId),
    eq(growthActions.creationKey, input.creationKey),
    eq(growthActions.factHash, input.factHash),
    expectedReviewVersion === undefined
      ? undefined
      : eq(growthActions.id, input.id),
  );
  const targets = input.targets.map((target) =>
    tx
      .insert(growthActionTargets)
      .select(
        tx
          .select({
            projectId: growthActions.projectId,
            actionId: growthActions.id,
            targetType: growthRecommendationTargets.targetType,
            targetValue: growthRecommendationTargets.targetValue,
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
            growthRecommendationTargets,
            and(
              eq(
                growthRecommendationTargets.projectId,
                growthRecommendations.projectId,
              ),
              eq(
                growthRecommendationTargets.runId,
                growthRecommendations.runId,
              ),
              eq(
                growthRecommendationTargets.recommendationId,
                growthRecommendations.id,
              ),
              eq(growthRecommendationTargets.targetType, target.targetType),
              eq(growthRecommendationTargets.targetValue, target.targetValue),
            ),
          )
          .where(parentWhere),
      )
      .onConflictDoNothing({
        target: [
          growthActionTargets.projectId,
          growthActionTargets.actionId,
          growthActionTargets.targetType,
          growthActionTargets.targetValue,
        ],
      }),
  );
  const creationEvent = tx
    .insert(growthActionEvents)
    .select(
      tx
        .select({
          id: sql<string>`${input.eventId}`.as("id"),
          projectId: growthActions.projectId,
          actionId: growthActions.id,
          actionVersion: growthActions.stateVersion,
          factHash: sql<string>`${input.eventFactHash}`.as("fact_hash"),
          eventType: sql<"created">`'created'`.as("event_type"),
          actorType: sql<ActionActorType>`${input.actorType}`.as("actor_type"),
          actorId: sql<string>`${input.actorId}`.as("actor_id"),
          fromStatus: sql<null>`NULL`.as("from_status"),
          toStatus: growthActions.status,
          note: sql<string | null>`${input.note}`.as("note"),
          createdAt: sql<string>`${createdAt}`.as("created_at"),
        })
        .from(growthActions)
        .where(
          and(
            parentWhere,
            eq(growthActions.status, "approved"),
            eq(growthActions.stateVersion, 0),
          ),
        ),
    )
    .onConflictDoNothing({
      target: [
        growthActionEvents.projectId,
        growthActionEvents.actionId,
        growthActionEvents.actionVersion,
      ],
    });

  return [parent, ...targets, creationEvent];
}

export async function createActionGraph(input: CreateActionGraphInput) {
  const createdAt = new Date().toISOString();
  await runBatch((tx) => buildActionCreationStatements(tx, input, createdAt));
}

export async function approveActionGraph(
  input: CreateActionGraphInput & {
    expectedReviewVersion: number;
  },
) {
  const createdAt = new Date().toISOString();
  await runBatch((tx) => {
    // Only this invocation's complete graph can accept the proposal. An
    // occupied creation key must not accept it using a different saved Action.
    const completeGraph = exists(
      tx
        .select({ value: sql<number>`1` })
        .from(growthActions)
        .innerJoin(
          growthActionEvents,
          and(
            eq(growthActionEvents.projectId, growthActions.projectId),
            eq(growthActionEvents.actionId, growthActions.id),
          ),
        )
        .where(
          and(
            eq(growthActions.projectId, input.projectId),
            eq(growthActions.id, input.id),
            eq(growthActions.recommendationId, input.recommendationId),
            eq(growthActions.creationKey, input.creationKey),
            eq(growthActions.factHash, input.factHash),
            eq(growthActions.status, "approved"),
            eq(growthActions.stateVersion, 0),
            eq(growthActionEvents.id, input.eventId),
            eq(growthActionEvents.actionVersion, 0),
            eq(growthActionEvents.factHash, input.eventFactHash),
            eq(growthActionEvents.eventType, "created"),
            eq(growthActionEvents.actorType, input.actorType),
            eq(growthActionEvents.actorId, input.actorId),
            ...input.targets.map((target) =>
              exists(
                tx
                  .select({ value: sql<number>`1` })
                  .from(growthActionTargets)
                  .where(
                    and(
                      eq(
                        growthActionTargets.projectId,
                        growthActions.projectId,
                      ),
                      eq(growthActionTargets.actionId, growthActions.id),
                      eq(growthActionTargets.targetType, target.targetType),
                      eq(growthActionTargets.targetValue, target.targetValue),
                    ),
                  ),
              ),
            ),
          ),
        ),
    );
    const briefApproval = input.aiBriefApproval;
    return [
      ...(briefApproval
        ? [
            tx
              .update(growthAiBriefs)
              .set({ proposalWriteKey: input.id })
              .where(
                and(
                  eq(growthAiBriefs.projectId, input.projectId),
                  eq(growthAiBriefs.id, briefApproval.briefId),
                  eq(growthAiBriefs.recommendationId, input.recommendationId),
                  eq(growthAiBriefs.version, briefApproval.expectedVersion),
                  sql`${growthAiBriefs.approvedActionId} IS NULL`,
                ),
              ),
          ]
        : []),
      ...buildActionCreationStatements(
        tx,
        input,
        createdAt,
        input.expectedReviewVersion,
      ),
      buildRecommendationReviewStatement(
        tx,
        {
          projectId: input.projectId,
          recommendationId: input.recommendationId,
          expectedStatus: "proposed",
          expectedVersion: input.expectedReviewVersion,
          status: "accepted",
          dismissalReason: null,
          snoozedUntil: null,
          resolutionRecommendationId: null,
          reviewedAt: createdAt,
        },
        completeGraph,
      ),
      ...(briefApproval
        ? [
            tx
              .update(growthAiBriefs)
              .set({
                approvedActionId: input.id,
                approvedVersion: briefApproval.expectedVersion,
                approvedDueOn: briefApproval.dueOn,
                approvedAt: createdAt,
                approvedActorId: briefApproval.actorId,
                updatedAt: createdAt,
              })
              .where(
                and(
                  eq(growthAiBriefs.projectId, input.projectId),
                  eq(growthAiBriefs.id, briefApproval.briefId),
                  eq(growthAiBriefs.proposalWriteKey, input.id),
                  completeGraph,
                  exists(
                    tx
                      .select({ value: sql`1` })
                      .from(growthRecommendations)
                      .where(
                        and(
                          eq(growthRecommendations.projectId, input.projectId),
                          eq(growthRecommendations.id, input.recommendationId),
                          eq(growthRecommendations.status, "accepted"),
                          eq(
                            growthRecommendations.reviewVersion,
                            input.expectedReviewVersion + 1,
                          ),
                        ),
                      ),
                  ),
                ),
              ),
          ]
        : []),
    ];
  });
}

type ActionTransitionStatementInput = {
  projectId: string;
  actionId: string;
  expectedStatus: ActionStatus;
  expectedVersion: number;
  status: ActionStatus;
  eventId: string;
  eventFactHash: string;
  actorType: ActionActorType;
  actorId: string;
  note: string | null;
};

export function buildActionTransitionStatements(
  tx: BatchExecutor,
  input: ActionTransitionStatementInput,
  occurredAt: string,
  guard?: SQL,
) {
  const update = tx
    .update(growthActions)
    .set({
      status: input.status,
      stateVersion: sql`${growthActions.stateVersion} + 1`,
      startedAt:
        input.status === "in_progress"
          ? sql`COALESCE(${growthActions.startedAt}, ${occurredAt})`
          : growthActions.startedAt,
      implementedAt:
        input.status === "implemented"
          ? sql`COALESCE(${growthActions.implementedAt}, ${occurredAt})`
          : growthActions.implementedAt,
      evaluatedAt:
        input.status === "evaluated"
          ? sql`COALESCE(${growthActions.evaluatedAt}, ${occurredAt})`
          : growthActions.evaluatedAt,
      cancelledAt:
        input.status === "cancelled"
          ? sql`COALESCE(${growthActions.cancelledAt}, ${occurredAt})`
          : growthActions.cancelledAt,
      updatedAt: occurredAt,
    })
    .where(
      and(
        eq(growthActions.projectId, input.projectId),
        eq(growthActions.id, input.actionId),
        eq(growthActions.status, input.expectedStatus),
        eq(growthActions.stateVersion, input.expectedVersion),
        guard,
      ),
    );
  const event = tx
    .insert(growthActionEvents)
    .select(
      tx
        .select({
          id: sql<string>`${input.eventId}`.as("id"),
          projectId: growthActions.projectId,
          actionId: growthActions.id,
          actionVersion: growthActions.stateVersion,
          factHash: sql<string>`${input.eventFactHash}`.as("fact_hash"),
          eventType: sql<"status_changed">`'status_changed'`.as("event_type"),
          actorType: sql<ActionActorType>`${input.actorType}`.as("actor_type"),
          actorId: sql<string>`${input.actorId}`.as("actor_id"),
          fromStatus: sql<ActionStatus>`${input.expectedStatus}`.as(
            "from_status",
          ),
          toStatus: growthActions.status,
          note: sql<string | null>`${input.note}`.as("note"),
          createdAt: sql<string>`${occurredAt}`.as("created_at"),
        })
        .from(growthActions)
        .where(
          and(
            eq(growthActions.projectId, input.projectId),
            eq(growthActions.id, input.actionId),
            eq(growthActions.status, input.status),
            eq(growthActions.stateVersion, input.expectedVersion + 1),
            eq(growthActions.updatedAt, occurredAt),
            guard,
          ),
        ),
    )
    .onConflictDoNothing({
      target: [
        growthActionEvents.projectId,
        growthActionEvents.actionId,
        growthActionEvents.actionVersion,
      ],
    });
  return [update, event] as const;
}

export async function transitionAction(input: ActionTransitionStatementInput) {
  const occurredAt = new Date().toISOString();
  await runBatch((tx) => {
    return buildActionTransitionStatements(tx, input, occurredAt);
  });
}
