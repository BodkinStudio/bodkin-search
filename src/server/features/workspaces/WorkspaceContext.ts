import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { listMemberships } from "./WorkspaceRepository";

export const WORKSPACE_COOKIE = "bodkin-workspace";
// The cookie selects a workspace; only a fresh membership grants access.
export async function selectWorkspaceContext(
  context: EnsuredUserContext,
  headers: Headers,
): Promise<EnsuredUserContext> {
  const memberships = await listMemberships(context.userId);
  const selected = headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(WORKSPACE_COOKIE + "="))
    ?.slice(WORKSPACE_COOKIE.length + 1);
  const workspace =
    memberships.find((item) => item.id === selected) ??
    memberships.find((item) => item.id === context.organizationId) ??
    memberships[0];
  return { ...context, organizationId: workspace?.id ?? "" };
}
