import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { selectWorkspace } from "@/serverFunctions/clientWorkspaces";
import { clearLastProjectId } from "@/client/lib/active-project";
import { useWorkspaceAccess } from "@/client/features/workspaces/useWorkspaceAccess";

/** Selects a workspace, drops every cached query from the old one and reloads. */
export async function switchWorkspace(
  cache: QueryClient,
  organizationId: string,
  to = "/",
) {
  await selectWorkspace({ data: { organizationId } });
  await cache.cancelQueries();
  cache.clear();
  clearLastProjectId();
  window.location.assign(to);
}

export function WorkspaceSwitcher() {
  const access = useWorkspaceAccess();
  const session = access.session;
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previous = useRef<string | null>(null);
  const membershipKey = access.clientWorkspaces
    ? JSON.stringify([session.data?.organizationId, access.role])
    : null;
  useEffect(() => {
    if (!membershipKey || !session.isSuccess) return;
    if (previous.current && previous.current !== membershipKey) {
      void cache.cancelQueries().then(() => {
        cache.clear();
        clearLastProjectId();
        window.location.assign("/");
      });
    }
    previous.current = membershipKey;
  }, [membershipKey, session.isSuccess, cache]);
  if (!session.data?.enabled) return null;
  const active = access.workspace;
  const accessRemoved = !access.can("read");
  return (
    <div className="space-y-2 px-3 py-2">
      <label className="text-xs font-medium" htmlFor="workspace-select">
        Workspace
      </label>
      <select
        id="workspace-select"
        className="select select-sm w-full"
        value={active?.id ?? ""}
        disabled={busy || session.data.memberships.length === 0}
        onChange={async (event) => {
          setBusy(true);
          setError("");
          try {
            await switchWorkspace(cache, event.target.value);
          } catch {
            setError("Could not switch workspace. Try again.");
            setBusy(false);
          }
        }}
      >
        {!active && <option value="">Choose a workspace</option>}
        {session.data.memberships.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      {accessRemoved ? (
        <p role="status" className="text-xs text-warning">
          {session.data.memberships.length === 0
            ? "You don't have access to any workspace. Ask the workspace owner to invite you."
            : "Your access to this workspace has been removed. Ask the workspace owner to restore it, or choose another workspace."}
        </p>
      ) : (
        access.role && (
          <p className="text-xs text-base-content/60">
            {access.role === "viewer"
              ? "Viewer · read-only access"
              : access.role.charAt(0).toUpperCase() + access.role.slice(1)}
          </p>
        )
      )}
      {access.can("manage_people") && (
        <a className="link text-xs" href="/workspace-people">
          Manage people
        </a>
      )}
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
