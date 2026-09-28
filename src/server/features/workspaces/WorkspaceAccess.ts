export { clientWorkspacesEnabled } from "./workspace-mode";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member, workspaceConfiguration } from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import {
  canWorkspace,
  workspaceRoleSchema,
  type WorkspaceCapability,
} from "@/shared/workspaces/permissions";

export async function requireWorkspaceMembership(
  userId: string,
  organizationId: string,
  capability: WorkspaceCapability = "read",
) {
  const [membership] = await db
    .select({
      id: member.id,
      organizationId: member.organizationId,
      userId: member.userId,
      role: member.role,
    })
    .from(member)
    .innerJoin(
      workspaceConfiguration,
      eq(workspaceConfiguration.organizationId, member.organizationId),
    )
    .where(
      and(
        eq(member.userId, userId),
        eq(member.organizationId, organizationId),
        eq(workspaceConfiguration.status, "active"),
      ),
    )
    .limit(1);
  if (!membership || !canWorkspace(membership.role, capability))
    throw new AppError("FORBIDDEN");
  return { ...membership, role: workspaceRoleSchema.parse(membership.role) };
}
