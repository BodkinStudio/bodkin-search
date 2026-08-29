import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
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
  getAction,
  getActionChange,
  listChangeEventUrls,
  listChangeEventActionIds,
  projectDomain,
  createChangeEventGraph,
  linkActionChange,
} as const;
