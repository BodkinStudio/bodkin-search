import { queryOptions, useQuery } from "@tanstack/react-query";
import { getWorkspaceSession } from "@/serverFunctions/clientWorkspaces";
import {
  canWorkspace,
  type WorkspaceCapability,
} from "@/shared/workspaces/permissions";

export const workspaceSessionOptions = () =>
  queryOptions({
    queryKey: ["workspace-session"],
    queryFn: () => getWorkspaceSession(),
    staleTime: 0,
    retry: false,
  });

type WorkspaceSession = Awaited<ReturnType<typeof getWorkspaceSession>>;

/** Build-time flag; the loaded session's `enabled` wins once it arrives. */
export function clientWorkspacesBuild() {
  return import.meta.env.CLIENT_WORKSPACES_ENABLED === "true";
}

/**
 * The current user's standing in the active workspace. Outside client
 * workspaces (local_noauth, Cloudflare Access, plain hosted) there is one
 * workspace per account and the user owns it, so everything is allowed. In a
 * client workspace the role comes from the active membership. Until the
 * session loads, or when the role is not a recognised one (the legacy
 * "member"), nothing is allowed.
 */
export function workspaceAccess(session: WorkspaceSession | undefined) {
  const clientWorkspaces = session?.enabled ?? clientWorkspacesBuild();
  const workspace = session?.memberships.find(
    (item) => item.id === session.organizationId,
  );
  const role = !session
    ? null
    : session.enabled
      ? (workspace?.role ?? null)
      : "owner";
  return {
    clientWorkspaces,
    workspace,
    role,
    can: (capability: WorkspaceCapability) =>
      role !== null && canWorkspace(role, capability),
  };
}

export function useWorkspaceAccess() {
  const session = useQuery(workspaceSessionOptions());
  // A failed refetch keeps the last data; don't grant from a stale role.
  return {
    ...workspaceAccess(session.isSuccess ? session.data : undefined),
    session,
  };
}
