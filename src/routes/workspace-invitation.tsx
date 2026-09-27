import { signOutAndRedirect } from "@/lib/auth-client";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";
import {
  acceptWorkspaceInvitation,
  getWorkspaceInvitation,
  selectWorkspace,
} from "@/serverFunctions/clientWorkspaces";
import { clearLastProjectId } from "@/client/lib/active-project";

export const Route = createFileRoute("/workspace-invitation")({
  validateSearch: z.object({ token: z.string().catch("") }),
  component: InvitationPage,
  head: () => ({
    meta: [
      { name: "referrer", content: "no-referrer" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
function InvitationPage() {
  const { token } = Route.useSearch();
  const auth = useHostedAuthRouteGuard();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = /^[a-f0-9]{64}$/.test(token);
  const invitation = useQuery({
    queryKey: ["workspace-invitation", token],
    queryFn: () => getWorkspaceInvitation({ data: { token } }),
    enabled: valid && auth.canRenderAuthenticatedContent,
    retry: false,
  });
  const details = invitation.data;
  const state = details?.state;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-lg border border-base-300 bg-base-100 p-6 shadow-sm sm:p-8">
        <p className="text-sm text-base-content/60">Bodkin Search</p>
        <h1 className="mt-3 text-2xl font-semibold">Workspace invitation</h1>
        {!auth.canRenderAuthenticatedContent ? (
          <p className="mt-4" role="status">
            Sign in to view your invitation.
          </p>
        ) : !valid || invitation.isError ? (
          <p className="mt-4">
            This invitation is unavailable. Ask the workspace owner for a new
            link.
          </p>
        ) : invitation.isPending ? (
          <p className="mt-4" role="status">
            Checking invitation…
          </p>
        ) : details?.state === "pending" ? (
          <>
            <p className="mt-4">
              You’re invited to <strong>{details.workspace.name}</strong> as a{" "}
              {details.role}.
            </p>
            <p className="mt-2 text-sm text-base-content/60">
              You’ll have access to the projects in this workspace.
            </p>
            <button
              className="btn btn-primary mt-6"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await acceptWorkspaceInvitation({
                    data: { token },
                  });
                  if (result.state === "accepted" && "workspaceId" in result) {
                    await selectWorkspace({
                      data: { organizationId: result.workspaceId },
                    });
                    await cache.cancelQueries();
                    cache.clear();
                    clearLastProjectId();
                    window.location.replace("/");
                  } else {
                    await invitation.refetch();
                    setError(
                      "The invitation is no longer available. Ask the owner for a new link.",
                    );
                  }
                } catch {
                  setError("Could not join the workspace. Try again.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Joining…" : "Accept invitation"}
            </button>
          </>
        ) : (
          <p className="mt-4">
            {state === "wrong_account"
              ? "This invitation is for a different email address. Sign out and sign in with the invited address."
              : state === "verify_email"
                ? "Verify your email before accepting this invitation."
                : state === "expired"
                  ? "This invitation has expired. Ask the owner to send a new one."
                  : state === "accepted"
                    ? "This invitation has already been accepted. Open the app to view your workspaces."
                    : "This invitation is no longer available. Ask the owner for a new link."}
          </p>
        )}
        {state === "wrong_account" && auth.isHostedMode && (
          <button className="btn btn-primary mt-4" onClick={signOutAndRedirect}>
            Sign in with the invited email
          </button>
        )}
        {error && (
          <p className="mt-4 text-error" role="alert">
            {error}
          </p>
        )}
        <a className="link mt-6 text-sm" href="/">
          Open Bodkin Search
        </a>
      </div>
    </main>
  );
}
