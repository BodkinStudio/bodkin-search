import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  not,
  or,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import {
  growthActionChanges,
  growthActions,
  growthActionTargets,
  growthChangeEvents,
  growthChangeEventUrls,
  growthMeasurementPlans,
  growthMeasurementResults,
} from "@/db/schema";

const ACTION_CAP = 12;
const RESULT_CAP = 20;
const CHANGE_CAP = 12;
const D1_ID_BATCH = 80;
// The canonical Action and Change write schemas each accept at most 100 URLs.
// Keep this read bounded as a fail-closed guard if storage is ever corrupted.
const URLS_PER_SOURCE_CAP = 100;

export type MonthlySourceBounds = {
  dataCutoffAt: string;
  periodStartAt: string;
  periodEndExclusiveAt: string;
  cutoffStartAt: string;
  nextMonthStartAt: string;
  nextMonthEndExclusiveAt: string;
};
const chunks = <T>(values: T[]) =>
  Array.from({ length: Math.ceil(values.length / D1_ID_BATCH) }, (_, index) =>
    values.slice(index * D1_ID_BATCH, (index + 1) * D1_ID_BATCH),
  );

/** BINARY/C matches JavaScript code-unit ordering for server-created ASCII IDs. */
function codeUnitId(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column} COLLATE "C"`
    : sql`${column} COLLATE BINARY`;
}

function riskPredicate(bounds: MonthlySourceBounds) {
  return or(
    eq(growthActions.status, "blocked"),
    and(
      inArray(growthActions.status, ["approved", "ready", "in_progress"]),
      lt(growthActions.dueAt, bounds.cutoffStartAt),
    ),
  )!;
}

function nextMonthPredicate(bounds: MonthlySourceBounds) {
  return and(
    inArray(growthActions.status, ["approved", "ready", "in_progress"]),
    gte(growthActions.dueAt, bounds.nextMonthStartAt),
    lt(growthActions.dueAt, bounds.nextMonthEndExclusiveAt),
  )!;
}

/** Project-scoped, cutoff-bounded source reads. Timezone membership arrives as UTC half-open bounds. */
async function listMonthlySourceFacts(
  projectId: string,
  bounds: MonthlySourceBounds,
) {
  const cutoff = lte(growthActions.updatedAt, bounds.dataCutoffAt);
  const [performance, earlierResults, completed, riskCandidates, changes] =
    await Promise.all([
      listResults(projectId, bounds, false),
      listResults(projectId, bounds, true),
      db
        .select()
        .from(growthActions)
        .where(
          and(
            eq(growthActions.projectId, projectId),
            cutoff,
            gte(growthActions.implementedAt, bounds.periodStartAt),
            lt(growthActions.implementedAt, bounds.periodEndExclusiveAt),
          ),
        )
        .orderBy(
          desc(growthActions.implementedAt),
          desc(growthActions.priorityScore),
          asc(codeUnitId(growthActions.id)),
        )
        .limit(ACTION_CAP + 1),
      db
        .select()
        .from(growthActions)
        .where(
          and(
            eq(growthActions.projectId, projectId),
            cutoff,
            riskPredicate(bounds),
          ),
        )
        .orderBy(
          desc(eq(growthActions.status, "blocked")),
          asc(growthActions.dueAt),
          desc(growthActions.priorityScore),
          asc(codeUnitId(growthActions.id)),
        )
        .limit(ACTION_CAP + 1),
      db
        .select()
        .from(growthChangeEvents)
        .where(
          and(
            eq(growthChangeEvents.projectId, projectId),
            lte(growthChangeEvents.createdAt, bounds.dataCutoffAt),
            gte(growthChangeEvents.happenedAt, bounds.periodStartAt),
            lt(growthChangeEvents.happenedAt, bounds.periodEndExclusiveAt),
          ),
        )
        .orderBy(
          desc(growthChangeEvents.happenedAt),
          asc(codeUnitId(growthChangeEvents.id)),
        )
        .limit(CHANGE_CAP + 1),
    ]);
  const nextCandidates = await db
    .select()
    .from(growthActions)
    .where(
      and(
        eq(growthActions.projectId, projectId),
        cutoff,
        nextMonthPredicate(bounds),
        not(riskPredicate(bounds)),
      ),
    )
    .orderBy(
      asc(growthActions.dueAt),
      desc(growthActions.priorityScore),
      asc(codeUnitId(growthActions.id)),
    )
    .limit(ACTION_CAP + 1);
  const opportunities = await db
    .select()
    .from(growthActions)
    .where(
      and(
        eq(growthActions.projectId, projectId),
        cutoff,
        inArray(growthActions.status, ["approved", "ready"]),
        not(riskPredicate(bounds)),
        not(nextMonthPredicate(bounds)),
      ),
    )
    .orderBy(
      desc(growthActions.priorityScore),
      asc(growthActions.dueAt),
      asc(codeUnitId(growthActions.id)),
    )
    .limit(ACTION_CAP + 1);
  const selectedActionIds = [
    ...new Set(
      [
        ...completed,
        ...riskCandidates,
        ...nextCandidates,
        ...opportunities,
        ...performance.map(({ action }) => action),
        ...earlierResults.map(({ action }) => action),
      ].map(({ id }) => id),
    ),
  ];
  const changeIds = changes.map(({ id }) => id);
  const [actionUrls, changeUrls, links] = await Promise.all([
    listActionUrls(projectId, selectedActionIds),
    listChangeUrls(projectId, changeIds),
    listChangeLinks(projectId, changeIds, bounds.dataCutoffAt),
  ]);
  return {
    performance: performance.map(({ result, action }) => ({
      ...result,
      action,
    })),
    earlierResults: earlierResults.map(({ result, action }) => ({
      ...result,
      action,
    })),
    completed,
    risks: riskCandidates,
    next: nextCandidates,
    opportunities,
    changes,
    actionUrls,
    changeUrls,
    links,
  };
}

async function listResults(
  projectId: string,
  bounds: MonthlySourceBounds,
  earlierOnly: boolean,
) {
  const predicates = [
    eq(growthMeasurementResults.projectId, projectId),
    lte(growthMeasurementResults.createdAt, bounds.dataCutoffAt),
    lte(growthMeasurementResults.evaluatedAt, bounds.dataCutoffAt),
    gte(growthMeasurementResults.evaluatedAt, bounds.periodStartAt),
    lt(growthMeasurementResults.evaluatedAt, bounds.periodEndExclusiveAt),
    eq(growthMeasurementPlans.status, "completed"),
    eq(growthActions.status, "evaluated"),
    lte(growthActions.updatedAt, bounds.dataCutoffAt),
  ];
  if (earlierOnly)
    predicates.push(lt(growthActions.implementedAt, bounds.periodStartAt));
  return db
    .select({ result: growthMeasurementResults, action: growthActions })
    .from(growthMeasurementResults)
    .innerJoin(
      growthMeasurementPlans,
      and(
        eq(
          growthMeasurementPlans.projectId,
          growthMeasurementResults.projectId,
        ),
        eq(
          growthMeasurementPlans.id,
          growthMeasurementResults.measurementPlanId,
        ),
      ),
    )
    .innerJoin(
      growthActions,
      and(
        eq(growthActions.projectId, growthMeasurementPlans.projectId),
        eq(growthActions.id, growthMeasurementPlans.actionId),
      ),
    )
    .where(and(...predicates))
    .orderBy(
      desc(growthMeasurementResults.evaluatedAt),
      asc(codeUnitId(growthMeasurementResults.id)),
    )
    .limit(RESULT_CAP + 1);
}

async function listActionUrls(projectId: string, actionIds: string[]) {
  const rows = await Promise.all(
    chunks(actionIds).map((ids) =>
      db
        .select({
          actionId: growthActionTargets.actionId,
          url: growthActionTargets.targetValue,
        })
        .from(growthActionTargets)
        .where(
          and(
            eq(growthActionTargets.projectId, projectId),
            eq(growthActionTargets.targetType, "url"),
            inArray(growthActionTargets.actionId, ids),
          ),
        )
        .orderBy(
          asc(growthActionTargets.actionId),
          asc(growthActionTargets.targetValue),
        )
        .limit(ids.length * URLS_PER_SOURCE_CAP),
    ),
  );
  return rows.flat();
}
async function listChangeUrls(projectId: string, changeIds: string[]) {
  const rows = await Promise.all(
    chunks(changeIds).map((ids) =>
      db
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
        .orderBy(
          asc(growthChangeEventUrls.changeEventId),
          asc(growthChangeEventUrls.url),
        )
        .limit(ids.length * URLS_PER_SOURCE_CAP),
    ),
  );
  return rows.flat();
}
async function listChangeLinks(
  projectId: string,
  changeIds: string[],
  dataCutoffAt: string,
) {
  const rows = await Promise.all(
    changeIds.map((changeId) =>
      db
        .select({
          changeEventId: growthActionChanges.changeEventId,
          actionId: growthActions.id,
        })
        .from(growthActionChanges)
        .innerJoin(
          growthActions,
          and(
            eq(growthActions.projectId, growthActionChanges.projectId),
            eq(growthActions.id, growthActionChanges.actionId),
          ),
        )
        .where(
          and(
            eq(growthActionChanges.projectId, projectId),
            eq(growthActionChanges.changeEventId, changeId),
            lte(growthActions.updatedAt, dataCutoffAt),
          ),
        )
        .orderBy(
          asc(codeUnitId(growthActionChanges.changeEventId)),
          asc(codeUnitId(growthActions.id)),
        )
        // Two rows distinguish no link, exactly one link and multiple links
        // without loading an unbounded Action-link set for a Change.
        .limit(2),
    ),
  );
  return rows.flat();
}

export const GrowthMonthlyReportsRepository = {
  listMonthlySourceFacts,
} as const;
