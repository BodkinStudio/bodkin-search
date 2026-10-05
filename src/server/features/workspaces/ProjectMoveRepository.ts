import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ga4Connections,
  googleAdsConnections,
  gscConnections,
  linkedinPageConnections,
  projects,
  workspaceAudit,
  youtubeConnections,
} from "@/db/schema";
import { runBatch } from "@/db/runBatch";
import type { PROJECT_ORGANIZATION_TABLES } from "./projectMoveTables";
import { actorCanManage, lockWorkspace } from "./WorkspaceRepository";

// Keyed by table name so a name added to PROJECT_ORGANIZATION_TABLES without
// a table here (or the reverse) fails to compile.
const projectOrganizationTables = {
  gsc_connections: gscConnections,
  ga4_connections: ga4Connections,
  google_ads_connections: googleAdsConnections,
  youtube_connections: youtubeConnections,
  linkedin_page_connections: linkedinPageConnections,
} satisfies Record<(typeof PROJECT_ORGANIZATION_TABLES)[number], unknown>;

// Moves a project, and every row that copies its organization, from one
// workspace to another in one batch. Each statement re-checks that the actor
// owns both active workspaces, that they share a payer, and that the project
// is still in the source, so a concurrent change leaves nothing half-moved.
// Returns whether the project ended up in the target.
export async function moveProject(
  actorId: string,
  projectId: string,
  fromOrganizationId: string,
  toOrganizationId: string,
) {
  const allowed = sql`${actorCanManage(fromOrganizationId, actorId, "owner")} and ${actorCanManage(toOrganizationId, actorId, "owner")} and (select payer_organization_id from workspace_configuration where organization_id = ${fromOrganizationId}) = (select payer_organization_id from workspace_configuration where organization_id = ${toOrganizationId}) and exists (select 1 from projects as moving where moving.id = ${projectId} and moving.organization_id = ${fromOrganizationId})`;
  const audit = (
    tx: Parameters<Parameters<typeof runBatch>[0]>[0],
    organizationId: string,
    action: string,
  ) =>
    tx.insert(workspaceAudit).select(
      tx
        .select({
          id: sql<string>`${crypto.randomUUID()}`.as("id"),
          organizationId: sql<string>`${organizationId}`.as("organizationId"),
          actorId: sql<string>`${actorId}`.as("actorId"),
          action: sql<string>`${action}`.as("action"),
          targetId: projects.id,
          role: sql<string | null>`null`.as("role"),
          createdAt: sql<string>`${new Date().toISOString()}`.as("createdAt"),
        })
        .from(projects)
        .where(and(eq(projects.id, projectId), allowed)),
    );
  await runBatch((tx) => [
    lockWorkspace(tx, fromOrganizationId),
    lockWorkspace(tx, toOrganizationId),
    audit(tx, fromOrganizationId, "project_moved_out"),
    audit(tx, toOrganizationId, "project_moved_in"),
    ...Object.values(projectOrganizationTables).map((table) =>
      tx
        .update(table)
        .set({ organizationId: toOrganizationId })
        .where(
          and(
            eq(table.projectId, projectId),
            eq(table.organizationId, fromOrganizationId),
            allowed,
          ),
        ),
    ),
    tx
      .update(projects)
      .set({ organizationId: toOrganizationId })
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.organizationId, fromOrganizationId),
          allowed,
        ),
      ),
  ]);
  const [moved] = await db
    .select({ organizationId: projects.organizationId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return moved?.organizationId === toOrganizationId;
}
