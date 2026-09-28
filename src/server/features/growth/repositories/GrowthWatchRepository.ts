import { and, asc, eq, exists, isNull, like, not, or } from "drizzle-orm";
import { db } from "@/db";
import {
  growthRuns,
  gscConnections,
  growthWorkstreams,
  projects,
} from "@/db/schema";

// Projects worth watching (live, with Search Console connected or a Growth
// plan) that have no run for this week's watch key yet.
async function listUnwatchedProjectIds(requestKey: string, limit: number) {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        isNull(projects.archivedAt),
        or(
          exists(
            db
              .select({ id: gscConnections.id })
              .from(gscConnections)
              .where(eq(gscConnections.projectId, projects.id)),
          ),
          exists(
            db
              .select({ id: growthWorkstreams.id })
              .from(growthWorkstreams)
              .where(eq(growthWorkstreams.projectId, projects.id)),
          ),
        ),
        not(
          exists(
            db
              .select({ id: growthRuns.id })
              .from(growthRuns)
              .where(
                and(
                  eq(growthRuns.projectId, projects.id),
                  like(growthRuns.cadenceSlot, `%${requestKey}`),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(asc(projects.id))
    .limit(limit);
  return rows.map((row) => row.id);
}

export const GrowthWatchRepository = { listUnwatchedProjectIds } as const;
