import {
  clientWorkspacesEnabled,
  requireWorkspaceMembership,
} from "@/server/features/workspaces/WorkspaceAccess";
import { env } from "cloudflare:workers";
import { getAuthMode } from "@/lib/auth-mode";
import { db } from "@/db";
import { member } from "@/db/schema";
import { and, eq } from "drizzle-orm";
export async function canAdministerAnalytics(
  userId: string,
  organizationId: string,
) {
  if (clientWorkspacesEnabled()) {
    try {
      await requireWorkspaceMembership(userId, organizationId, "admin");
      return true;
    } catch {
      return false;
    }
  }
  const mode = getAuthMode(env.AUTH_MODE);
  if (mode === "local_noauth" && userId === "local-admin") return true;
  if (
    mode === "cloudflare_access" &&
    (env.ANALYTICS_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .includes(userId)
  )
    return true;
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    )
    .limit(1);
  return !!membership && ["owner", "admin"].includes(membership.role);
}
export async function requireAnalyticsAdmin(
  userId: string,
  organizationId: string,
) {
  if (!(await canAdministerAnalytics(userId, organizationId)))
    throw new Error("Workspace administrator permission required");
}
