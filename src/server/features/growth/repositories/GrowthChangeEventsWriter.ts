import { and, eq, sql } from "drizzle-orm";
import { getDatabaseProvider } from "@/db/provider";
import { runBatch } from "@/db/runBatch";
import {
  growthActionChanges,
  growthActions,
  growthChangeEvents,
  growthChangeEventUrls,
  projects,
} from "@/db/schema";

type ChangeEventSource = typeof growthChangeEvents.$inferSelect.source;
type ChangeEventType = typeof growthChangeEvents.$inferSelect.changeType;
type ChangeEventActor = typeof growthChangeEvents.$inferSelect.actorType;

type CreateChangeEventGraphInput = {
  id: string;
  projectId: string;
  creationKey: string;
  factHash: string;
  source: ChangeEventSource;
  changeType: ChangeEventType;
  actorType: ChangeEventActor;
  actorId: string;
  description: string;
  happenedAt: string;
  externalRef: string | null;
  urls: string[];
  expectedDomain: string;
};

export async function createChangeEventGraph(
  input: CreateChangeEventGraphInput,
) {
  const createdAt = new Date().toISOString();
  await runBatch((tx) => {
    const source = tx
      .select({
        id: sql<string>`${input.id}`.as("id"),
        projectId: projects.id,
        creationKey: sql<string>`${input.creationKey}`.as("creation_key"),
        factHash: sql<string>`${input.factHash}`.as("fact_hash"),
        source: sql<ChangeEventSource>`${input.source}`.as("source"),
        changeType: sql<ChangeEventType>`${input.changeType}`.as("change_type"),
        actorType: sql<ChangeEventActor>`${input.actorType}`.as("actor_type"),
        actorId: sql<string>`${input.actorId}`.as("actor_id"),
        description: sql<string>`${input.description}`.as("description"),
        happenedAt: sql<string>`${input.happenedAt}`.as("happened_at"),
        externalRef: sql<string | null>`${input.externalRef}`.as(
          "external_ref",
        ),
        createdAt: sql<string>`${createdAt}`.as("created_at"),
      })
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.domain, input.expectedDomain),
          sql`${projects.archivedAt} IS NULL`,
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
      .insert(growthChangeEvents)
      .select(lockedSource)
      .onConflictDoNothing({
        target: [growthChangeEvents.projectId, growthChangeEvents.creationKey],
      });

    const winnerWhere = and(
      eq(growthChangeEvents.projectId, input.projectId),
      eq(growthChangeEvents.creationKey, input.creationKey),
      eq(growthChangeEvents.factHash, input.factHash),
      eq(projects.domain, input.expectedDomain),
      sql`${projects.archivedAt} IS NULL`,
    );
    const urls = input.urls.map((url) =>
      tx
        .insert(growthChangeEventUrls)
        .select(
          tx
            .select({
              projectId: growthChangeEvents.projectId,
              changeEventId: growthChangeEvents.id,
              url: sql<string>`${url}`.as("url"),
            })
            .from(growthChangeEvents)
            .innerJoin(projects, eq(projects.id, growthChangeEvents.projectId))
            .where(winnerWhere),
        )
        .onConflictDoNothing({
          target: [
            growthChangeEventUrls.projectId,
            growthChangeEventUrls.changeEventId,
            growthChangeEventUrls.url,
          ],
        }),
    );

    return [parent, ...urls];
  });
}

type LinkActionChangeInput = {
  projectId: string;
  changeEventId: string;
  actionId: string;
};

export async function linkActionChange(input: LinkActionChangeInput) {
  await runBatch((tx) => {
    const source = tx
      .select({
        projectId: growthChangeEvents.projectId,
        actionId: growthActions.id,
        changeEventId: growthChangeEvents.id,
      })
      .from(growthChangeEvents)
      .innerJoin(
        growthActions,
        and(
          eq(growthActions.projectId, growthChangeEvents.projectId),
          eq(growthActions.projectId, input.projectId),
          eq(growthActions.id, input.actionId),
        ),
      )
      .where(
        and(
          eq(growthChangeEvents.projectId, input.projectId),
          eq(growthChangeEvents.id, input.changeEventId),
        ),
      );
    // Lock both immutable association endpoints until the insert completes on
    // Postgres. D1's batch already executes atomically against one snapshot.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the provider guard proves this narrower Postgres builder surface
    const postgresSource = source as unknown as {
      for: (strength: "share") => typeof source;
    };
    const lockedSource =
      getDatabaseProvider() === "postgres"
        ? postgresSource.for("share")
        : source;
    const link = tx
      .insert(growthActionChanges)
      .select(lockedSource)
      .onConflictDoNothing({
        target: [
          growthActionChanges.projectId,
          growthActionChanges.actionId,
          growthActionChanges.changeEventId,
        ],
      });
    return [link];
  });
}
