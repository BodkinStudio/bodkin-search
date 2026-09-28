import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  growthActions,
  growthActionTargets,
  growthPageSnapshots,
  projectKeyPages,
  projects,
} from "@/db/schema";

async function projectDomain(projectId: string) {
  const [row] = await db
    .select({ domain: projects.domain })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row?.domain ?? null;
}

async function listKeyPageUrls(projectId: string) {
  const rows = await db
    .select({ url: projectKeyPages.url })
    .from(projectKeyPages)
    .where(eq(projectKeyPages.projectId, projectId));
  return rows.map((row) => row.url);
}

// Pages named as targets of work still on the plan.
async function listActionTargetUrls(projectId: string) {
  const rows = await db
    .select({ url: growthActionTargets.targetValue })
    .from(growthActionTargets)
    .innerJoin(
      growthActions,
      and(
        eq(growthActions.projectId, growthActionTargets.projectId),
        eq(growthActions.id, growthActionTargets.actionId),
      ),
    )
    .where(
      and(
        eq(growthActionTargets.projectId, projectId),
        eq(growthActionTargets.targetType, "url"),
        ne(growthActions.status, "cancelled"),
      ),
    );
  return rows.map((row) => row.url);
}

async function latestSnapshots(projectId: string, urls: string[]) {
  if (urls.length === 0) return new Map<string, Snapshot>();
  const rows = await db
    .select()
    .from(growthPageSnapshots)
    .where(
      and(
        eq(growthPageSnapshots.projectId, projectId),
        inArray(growthPageSnapshots.url, urls),
      ),
    )
    .orderBy(desc(growthPageSnapshots.capturedAt));
  const latest = new Map<string, Snapshot>();
  for (const row of rows) if (!latest.has(row.url)) latest.set(row.url, row);
  return latest;
}

type Snapshot = typeof growthPageSnapshots.$inferSelect;

async function insertSnapshot(snapshot: Snapshot) {
  await db.insert(growthPageSnapshots).values(snapshot);
}

export const GrowthPageMonitorRepository = {
  projectDomain,
  listKeyPageUrls,
  listActionTargetUrls,
  latestSnapshots,
  insertSnapshot,
} as const;
