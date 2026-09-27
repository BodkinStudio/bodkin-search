import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  getWorkspaceSession,
  selectWorkspace,
} from "@/serverFunctions/clientWorkspaces";
import { clearLastProjectId } from "@/client/lib/active-project";

export const workspaceSessionOptions = () => ({
  queryKey: ["workspace-session"],
  queryFn: () => getWorkspaceSession(),
  staleTime: 0,
  retry: false as const,
});

export function WorkspaceSwitcher() {
  const session = useQuery(workspaceSessionOptions());
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previous = useRef<string | null>(null);
  const membershipKey = session.data?.enabled
    ? JSON.stringify([
        session.data.organizationId,
        session.data.memberships.find(
          (item) => item.id === session.data.organizationId,
        )?.role,
      ])
    : null;
  useEffect(() => {
    if (!membershipKey) return;
    if (previous.current && previous.current !== membershipKey) {
      void cache.cancelQueries().then(() => {
        cache.clear();
        clearLastProjectId();
        window.location.assign("/");
      });
    }
    previous.current = membershipKey;
  }, [membershipKey, cache]);
  if (!session.data?.enabled) return null;
  const active = session.data.memberships.find(
    (item) => item.id === session.data.organizationId,
  );
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
            await selectWorkspace({
              data: { organizationId: event.target.value },
            });
            await cache.cancelQueries();
            cache.clear();
            clearLastProjectId();
            window.location.assign("/");
          } catch {
            setError("Could not switch workspace. Try again.");
            setBusy(false);
          }
        }}
      >
        {!active && <option value="">No workspace access</option>}
        {session.data.memberships.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      {active && (
        <p className="text-xs text-base-content/60">
          {active.role === "viewer"
            ? "Viewer · read-only access"
            : active.role.charAt(0).toUpperCase() + active.role.slice(1)}
        </p>
      )}
      {(active?.role === "owner" || active?.role === "admin") && (
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
