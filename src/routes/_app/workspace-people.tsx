import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { workspaceSessionOptions } from "@/client/features/workspaces/WorkspaceSwitcher";
import {
  createClientWorkspace,
  resendWorkspaceInvitation,
  transferWorkspaceOwnership,
  getWorkspacePeople,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  updateWorkspaceMember,
} from "@/serverFunctions/clientWorkspaces";
import {
  canManageRole,
  workspaceRoleSchema,
  type WorkspaceRole,
} from "@/shared/workspaces/permissions";

export const Route = createFileRoute("/_app/workspace-people")({
  component: WorkspacePeople,
});
function WorkspacePeople() {
  const cache = useQueryClient();
  const session = useQuery(workspaceSessionOptions());
  const organizationId = session.data?.organizationId ?? "";
  const active = session.data?.memberships.find(
    (item) => item.id === organizationId,
  );
  const allowed = active?.role === "owner" || active?.role === "admin";
  const people = useQuery({
    queryKey: ["workspace-people", organizationId],
    queryFn: () => getWorkspacePeople({ data: { organizationId } }),
    enabled: !!organizationId && allowed,
    retry: false,
  });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await work();
      if (
        result &&
        typeof result === "object" &&
        "ok" in result &&
        result.ok === false
      ) {
        setError(
          "reason" in result
            ? String(result.reason)
            : "The change could not be saved.",
        );
      } else {
        setMessage(success);
        await cache.invalidateQueries({ queryKey: ["workspace-people"] });
        await cache.invalidateQueries({ queryKey: ["workspace-session"] });
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The change could not be saved. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (session.isPending)
    return (
      <p className="p-6" role="status">
        Loading workspace…
      </p>
    );
  if (!allowed)
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">People</h1>
        <p className="mt-3">Ask a workspace owner or admin to manage access.</p>
      </div>
    );
  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 p-4 sm:p-8">
      <header>
        <p className="text-sm text-base-content/60">{active?.name}</p>
        <h1 className="mt-1 text-2xl font-semibold">People and access</h1>
        <p className="mt-2 text-sm text-base-content/70">
          Members can access every project in this workspace. Your other
          workspaces stay private.
        </p>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      )}
      <InvitationForm
        organizationId={organizationId}
        actorRole={active?.role ?? ""}
        invitationsEnabled={people.data?.invitationsEnabled ?? false}
        busy={busy}
        action={action}
      />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Members</h2>
        {people.isPending && <p role="status">Loading people…</p>}
        {people.isError && (
          <div role="alert">
            Could not load people.{" "}
            <button className="link" onClick={() => void people.refetch()}>
              Try again
            </button>
          </div>
        )}
        {people.data?.members.map((person) => (
          <div
            key={person.id}
            className="flex flex-col gap-3 border-b border-base-300 py-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{person.name}</p>
              <p className="break-all text-sm text-base-content/60">
                {person.email}
              </p>
            </div>
            {canManageRole(active?.role ?? "", person.role) ? (
              <div className="flex items-center gap-2">
                <select
                  aria-label={`Role for ${person.email}`}
                  className="select select-sm"
                  value={person.role}
                  disabled={busy}
                  onChange={(event) => {
                    const nextRole: WorkspaceRole = workspaceRoleSchema.parse(
                      event.target.value,
                    );
                    void action(
                      () =>
                        updateWorkspaceMember({
                          data: {
                            organizationId,
                            memberId: person.id,
                            role: nextRole,
                          },
                        }),
                      "Role updated.",
                    );
                  }}
                >
                  {(active?.role === "owner"
                    ? ["owner", "admin", "editor", "viewer"]
                    : ["editor", "viewer"]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                {active?.role === "owner" && person.role !== "owner" && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Transfer ownership to ${person.email}? You will become an admin.`,
                        )
                      )
                        void action(
                          () =>
                            transferWorkspaceOwnership({
                              data: { organizationId, memberId: person.id },
                            }),
                          "Ownership transferred.",
                        );
                    }}
                  >
                    Transfer ownership
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${person.email} from this workspace? They will lose access immediately.`,
                      )
                    )
                      void action(
                        () =>
                          removeWorkspaceMember({
                            data: { organizationId, memberId: person.id },
                          }),
                        "Member removed.",
                      );
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <span className="badge badge-ghost">{person.role}</span>
            )}
          </div>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending invitations</h2>
        {people.data &&
          !people.data.invitations.some(
            (invite) => invite.status === "pending",
          ) && (
            <p className="text-sm text-base-content/60">
              No pending invitations.
            </p>
          )}
        {people.data?.invitations
          .filter((invite) => invite.status === "pending")
          .map((invite) => (
            <div
              key={invite.id}
              className="flex flex-wrap items-center gap-3 border-b border-base-300 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm">{invite.email}</p>
                <p className="text-xs text-base-content/60">
                  {invite.role} ·{" "}
                  {new Date(invite.expiresAt) < new Date()
                    ? "Expired"
                    : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                </p>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                disabled={
                  busy ||
                  !people.data?.invitationsEnabled ||
                  !canManageRole(active?.role ?? "", invite.role ?? "")
                }
                onClick={() =>
                  void action(
                    () =>
                      resendWorkspaceInvitation({
                        data: { organizationId, invitationId: invite.id },
                      }),
                    "A new invitation was sent. The old link no longer works.",
                  )
                }
              >
                Resend
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={
                  busy || !canManageRole(active?.role ?? "", invite.role ?? "")
                }
                onClick={() =>
                  void action(
                    () =>
                      revokeWorkspaceInvitation({
                        data: { organizationId, invitationId: invite.id },
                      }),
                    "Invitation revoked.",
                  )
                }
              >
                Revoke
              </button>
            </div>
          ))}
      </section>
      {active?.role === "owner" && (
        <section className="space-y-3 border-t border-base-300 pt-6">
          <h2 className="text-lg font-semibold">Create a client workspace</h2>
          <p className="text-sm text-base-content/60">
            Start with an empty workspace. Existing projects stay where they
            are.
          </p>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void action(
                () => createClientWorkspace({ data: { organizationId, name } }),
                "Workspace created. Select it from the workspace menu.",
              );
            }}
          >
            <input
              className="input flex-1"
              aria-label="New workspace name"
              required
              maxLength={100}
              placeholder="Client name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button className="btn" disabled={busy}>
              Create workspace
            </button>
          </form>
        </section>
      )}
    </main>
  );
}

function InvitationForm({
  organizationId,
  actorRole,
  invitationsEnabled,
  busy,
  action,
}: {
  organizationId: string;
  actorRole: string;
  invitationsEnabled: boolean;
  busy: boolean;
  action: (work: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("viewer");
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Invite someone</h2>
      {!invitationsEnabled && (
        <p className="text-sm text-base-content/70" role="status">
          Email invitations are not enabled yet. The app owner needs to finish
          email setup before you can invite clients.
        </p>
      )}
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void action(
            () =>
              inviteWorkspaceMember({
                data: { organizationId, email, role },
              }),
            "Invitation sent. They can join using the email link.",
          );
        }}
      >
        <label className="flex-1 space-y-1 text-sm">
          Email address
          <input
            className="input w-full"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="client@example.com"
          />
        </label>
        <label className="space-y-1 text-sm">
          Role
          <select
            className="select w-full"
            value={role}
            onChange={(event) =>
              setRole(
                workspaceRoleSchema
                  .exclude(["owner"])
                  .parse(event.target.value),
              )
            }
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            {actorRole === "owner" && <option value="admin">Admin</option>}
          </select>
        </label>
        <button
          className="btn btn-primary"
          disabled={busy || !invitationsEnabled}
          type="submit"
        >
          {busy ? "Saving…" : "Send invitation"}
        </button>
      </form>
      <p className="text-xs text-base-content/60">
        Viewers can read reports. Editors can update content. Admins also manage
        settings and client access. Invitations expire after seven days.
      </p>
    </section>
  );
}
