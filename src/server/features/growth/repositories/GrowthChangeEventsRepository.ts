import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import {
  growthActionChanges,
  growthActions,
  growthChangeEvents,
  growthChangeEventUrls,
  projects,
} from "@/db/schema";
import {
  createChangeEventGraph,
  linkActionChange,
} from "./GrowthChangeEventsWriter";
import type { GrowthRecentChangesRequest } from "@/types/schemas/growth-recent-changes";

function codeUnitId(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column} COLLATE "C"`
    : sql`${column} COLLATE BINARY`;
}

async function getChangeEvent(projectId: string, id: string) {
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
}

async function getChangeEventByKey(projectId: string, creationKey: string) {
  const [row] = await db
    .select()
    .from(growthChangeEvents)
    .where(
      and(
        eq(growthChangeEvents.projectId, projectId),
        eq(growthChangeEvents.creationKey, creationKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listChangeEventUrls(projectId: string, changeEventId: string) {
  const rows = await db
    .select({ url: growthChangeEventUrls.url })
    .from(growthChangeEventUrls)
    .where(
      and(
        eq(growthChangeEventUrls.projectId, projectId),
        eq(growthChangeEventUrls.changeEventId, changeEventId),
      ),
    )
    .orderBy(growthChangeEventUrls.url);
  return rows.map(({ url }) => url);
}

async function listChangeEventActionIds(
  projectId: string,
  changeEventId: string,
) {
  const rows = await db
    .select({ actionId: growthActionChanges.actionId })
    .from(growthActionChanges)
    .where(
      and(
        eq(growthActionChanges.projectId, projectId),
        eq(growthActionChanges.changeEventId, changeEventId),
      ),
    )
    .orderBy(growthActionChanges.actionId);
  return rows.map(({ actionId }) => actionId);
}

async function getChangeEventGraph(projectId: string, id: string) {
  const event = await getChangeEvent(projectId, id);
  if (!event) return null;
  const [urls, actionIds] = await Promise.all([
    listChangeEventUrls(projectId, id),
    listChangeEventActionIds(projectId, id),
  ]);
  return { event, urls, actionIds };
}

async function listManualChangeEventGraphs(projectId: string, limit: number) {
  const events = await db
    .select()
    .from(growthChangeEvents)
    .where(
      and(
        eq(growthChangeEvents.projectId, projectId),
        eq(growthChangeEvents.source, "manual"),
      ),
    )
    .orderBy(desc(growthChangeEvents.happenedAt), desc(growthChangeEvents.id))
    .limit(limit);
  if (events.length === 0) return [];
  const ids = events.map((event) => event.id);
  const urls = await db
    .select({
      changeEventId: growthChangeEventUrls.changeEventId,
      url: growthChangeEventUrls.url,
    })
    .from(growthChangeEventUrls)
    .where(
      and(
        eq(growthChangeEventUrls.projectId, projectId),
        inArray(growthChangeEventUrls.changeEventId, ids),
      ),
    )
    .orderBy(growthChangeEventUrls.changeEventId, growthChangeEventUrls.url);
  const urlsByEvent = new Map<string, string[]>();
  for (const row of urls) {
    const list = urlsByEvent.get(row.changeEventId) ?? [];
    list.push(row.url);
    urlsByEvent.set(row.changeEventId, list);
  }
  return events.map((event) => ({
    event,
    urls: urlsByEvent.get(event.id) ?? [],
    actionIds: [],
  }));
}

async function listRecentManualChangeEventsPage(
  input: GrowthRecentChangesRequest,
) {
  const eventId = codeUnitId(growthChangeEvents.id);
  const afterCursor = input.cursor
    ? or(
        lt(growthChangeEvents.happenedAt, input.cursor.happenedAt),
        and(
          eq(growthChangeEvents.happenedAt, input.cursor.happenedAt),
          lt(eventId, input.cursor.id),
        ),
      )
    : undefined;
  return db
    .select({
      id: growthChangeEvents.id,
      source: growthChangeEvents.source,
      changeType: growthChangeEvents.changeType,
      description: growthChangeEvents.description,
      happenedAt: growthChangeEvents.happenedAt,
      createdAt: growthChangeEvents.createdAt,
    })
    .from(growthChangeEvents)
    .where(
      and(
        eq(growthChangeEvents.projectId, input.projectId),
        eq(growthChangeEvents.source, "manual"),
        afterCursor,
      ),
    )
    .orderBy(desc(growthChangeEvents.happenedAt), desc(eventId))
    .limit(input.limit + 1);
}

async function listUrlsForRecentChangeEvents(
  projectId: string,
  changeEventIds: string[],
) {
  if (!changeEventIds.length) return [];
  const url = codeUnitId(growthChangeEventUrls.url);
  const ranked = db
    .select({
      changeEventId: growthChangeEventUrls.changeEventId,
      url: growthChangeEventUrls.url,
      rank: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${growthChangeEventUrls.changeEventId} ORDER BY ${url})`.as(
        "rank",
      ),
    })
    .from(growthChangeEventUrls)
    .where(
      and(
        eq(growthChangeEventUrls.projectId, projectId),
        inArray(growthChangeEventUrls.changeEventId, changeEventIds),
      ),
    )
    .as("ranked_change_event_urls");
  return db
    .select()
    .from(ranked)
    .where(sql`${ranked.rank} <= 101`)
    .orderBy(ranked.changeEventId, sql`${ranked.rank}`);
}

async function listManualChangeEventGraphsForAction(
  projectId: string,
  actionId: string,
  limit: number,
) {
  const events = await db
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
        eq(growthChangeEvents.source, "manual"),
      ),
    )
    .orderBy(desc(growthChangeEvents.happenedAt), desc(growthChangeEvents.id))
    .limit(limit);
  if (events.length === 0) return [];
  const ids = events.map(({ event }) => event.id);
  const urls = await db
    .select({
      changeEventId: growthChangeEventUrls.changeEventId,
      url: growthChangeEventUrls.url,
    })
    .from(growthChangeEventUrls)
    .where(
      and(
        eq(growthChangeEventUrls.projectId, projectId),
        inArray(growthChangeEventUrls.changeEventId, ids),
      ),
    )
    .orderBy(growthChangeEventUrls.changeEventId, growthChangeEventUrls.url);
  const urlsByEvent = new Map<string, string[]>();
  for (const row of urls) {
    const list = urlsByEvent.get(row.changeEventId) ?? [];
    list.push(row.url);
    urlsByEvent.set(row.changeEventId, list);
  }
  return events.map(({ event }) => ({
    event,
    urls: urlsByEvent.get(event.id) ?? [],
    actionIds: [actionId],
  }));
}

type MeasurementConfounderQuery = {
  projectId: string;
  urls: string[];
  startAt: string;
  endAt: string;
  excludedChangeEventId: string;
  limit: number;
};

async function listMeasurementConfounderCandidates(
  input: MeasurementConfounderQuery,
) {
  if (input.urls.length === 0) return [];
  const candidateEvents = db.$with("candidate_events").as(
    db
      .select()
      .from(growthChangeEvents)
      .where(
        and(
          eq(growthChangeEvents.projectId, input.projectId),
          ne(growthChangeEvents.id, input.excludedChangeEventId),
          gte(growthChangeEvents.happenedAt, input.startAt),
          lt(growthChangeEvents.happenedAt, input.endAt),
          exists(
            db
              .select({ value: sql<number>`1` })
              .from(growthChangeEventUrls)
              .where(
                and(
                  eq(growthChangeEventUrls.projectId, input.projectId),
                  eq(
                    growthChangeEventUrls.changeEventId,
                    growthChangeEvents.id,
                  ),
                  inArray(growthChangeEventUrls.url, input.urls),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(growthChangeEvents.happenedAt), asc(growthChangeEvents.id))
      .limit(input.limit),
  );
  const rows = await db
    .with(candidateEvents)
    .select({
      event: {
        id: candidateEvents.id,
        projectId: candidateEvents.projectId,
        creationKey: candidateEvents.creationKey,
        factHash: candidateEvents.factHash,
        source: candidateEvents.source,
        changeType: candidateEvents.changeType,
        actorType: candidateEvents.actorType,
        actorId: candidateEvents.actorId,
        description: candidateEvents.description,
        happenedAt: candidateEvents.happenedAt,
        externalRef: candidateEvents.externalRef,
        createdAt: candidateEvents.createdAt,
      },
      url: growthChangeEventUrls.url,
    })
    .from(candidateEvents)
    .innerJoin(
      growthChangeEventUrls,
      and(
        eq(growthChangeEventUrls.projectId, input.projectId),
        eq(growthChangeEventUrls.changeEventId, candidateEvents.id),
        inArray(growthChangeEventUrls.url, input.urls),
      ),
    )
    .orderBy(
      asc(candidateEvents.happenedAt),
      asc(candidateEvents.id),
      asc(growthChangeEventUrls.url),
    );
  const candidates = new Map<
    string,
    { event: (typeof rows)[number]["event"]; matchedUrls: string[] }
  >();
  for (const { event, url } of rows) {
    const candidate = candidates.get(event.id) ?? { event, matchedUrls: [] };
    candidate.matchedUrls.push(url);
    candidates.set(event.id, candidate);
  }
  return [...candidates.values()];
}

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

async function getActionChange(
  projectId: string,
  changeEventId: string,
  actionId: string,
) {
  const [row] = await db
    .select()
    .from(growthActionChanges)
    .where(
      and(
        eq(growthActionChanges.projectId, projectId),
        eq(growthActionChanges.changeEventId, changeEventId),
        eq(growthActionChanges.actionId, actionId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function projectDomain(projectId: string) {
  const [row] = await db
    .select({ domain: projects.domain })
    .from(projects)
    .where(and(eq(projects.id, projectId), sql`${projects.archivedAt} IS NULL`))
    .limit(1);
  return row?.domain ?? null;
}

export const GrowthChangeEventsRepository = {
  getChangeEvent,
  getChangeEventByKey,
  getChangeEventGraph,
  listManualChangeEventGraphs,
  listRecentManualChangeEventsPage,
  listUrlsForRecentChangeEvents,
  listManualChangeEventGraphsForAction,
  listMeasurementConfounderCandidates,
  getAction,
  getActionChange,
  listChangeEventUrls,
  listChangeEventActionIds,
  projectDomain,
  createChangeEventGraph,
  linkActionChange,
} as const;
