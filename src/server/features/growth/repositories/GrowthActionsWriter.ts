import { and, eq, exists, sql } from "drizzle-orm";
import { getDatabaseProvider } from "@/db/provider";
import { runBatch } from "@/db/runBatch";
import {
  growthActionEvents,
  growthActions,
  growthActionTargets,
  growthRecommendations,
  growthRecommendationTargets,
} from "@/db/schema";

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
};

export async function createActionGraph(input: CreateActionGraphInput) {
  const createdAt = new Date().toISOString();
  await runBatch((tx) => {
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
      })
      .from(growthRecommendations)
      .where(
        and(
          eq(growthRecommendations.projectId, input.projectId),
          eq(growthRecommendations.runId, input.runId),
          eq(growthRecommendations.id, input.recommendationId),
          eq(growthRecommendations.status, "accepted"),
          eq(growthRecommendations.category, input.category),
          eq(growthRecommendations.priorityScore, input.priorityScore),
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
                    eq(
                      growthRecommendationTargets.targetType,
                      target.targetType,
                    ),
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
      for: (strength: "share") => typeof source;
    };
    const lockedSource =
      getDatabaseProvider() === "postgres"
        ? postgresSource.for("share")
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
            actorType: sql<ActionActorType>`${input.actorType}`.as(
              "actor_type",
            ),
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
  });
}

type TransitionActionInput = {
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

export async function transitionAction(input: TransitionActionInput) {
  const createdAt = new Date().toISOString();
  await runBatch((tx) => {
    const update = tx
      .update(growthActions)
      .set({
        status: input.status,
        stateVersion: sql`${growthActions.stateVersion} + 1`,
        startedAt:
          input.status === "in_progress"
            ? sql`COALESCE(${growthActions.startedAt}, ${createdAt})`
            : growthActions.startedAt,
        implementedAt:
          input.status === "implemented"
            ? sql`COALESCE(${growthActions.implementedAt}, ${createdAt})`
            : growthActions.implementedAt,
        evaluatedAt:
          input.status === "evaluated"
            ? sql`COALESCE(${growthActions.evaluatedAt}, ${createdAt})`
            : growthActions.evaluatedAt,
        cancelledAt:
          input.status === "cancelled"
            ? sql`COALESCE(${growthActions.cancelledAt}, ${createdAt})`
            : growthActions.cancelledAt,
        updatedAt: createdAt,
      })
      .where(
        and(
          eq(growthActions.projectId, input.projectId),
          eq(growthActions.id, input.actionId),
          eq(growthActions.status, input.expectedStatus),
          eq(growthActions.stateVersion, input.expectedVersion),
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
            actorType: sql<ActionActorType>`${input.actorType}`.as(
              "actor_type",
            ),
            actorId: sql<string>`${input.actorId}`.as("actor_id"),
            fromStatus: sql<ActionStatus>`${input.expectedStatus}`.as(
              "from_status",
            ),
            toStatus: growthActions.status,
            note: sql<string | null>`${input.note}`.as("note"),
            createdAt: sql<string>`${createdAt}`.as("created_at"),
          })
          .from(growthActions)
          .where(
            and(
              eq(growthActions.projectId, input.projectId),
              eq(growthActions.id, input.actionId),
              eq(growthActions.status, input.status),
              eq(growthActions.stateVersion, input.expectedVersion + 1),
              eq(growthActions.updatedAt, createdAt),
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
    return [update, event];
  });
}
