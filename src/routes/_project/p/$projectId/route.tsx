import {
  Link,
  Outlet,
  createFileRoute,
  useMatch,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { setLastProjectId } from "@/client/lib/active-project";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";
import { FreePlanBanner } from "@/client/features/billing/FreePlanBanner";
import { useOnboardingRedirect } from "@/client/features/onboarding/useOnboardingRedirect";
import { getErrorCode } from "@/client/lib/error-messages";
import { AuthenticatedAppLayout } from "@/client/layout/AppShell";
import {
  getCurrentAuthRedirectFromHref,
  getSignInSearch,
} from "@/lib/auth-redirect";
import { getProjectAccess } from "@/serverFunctions/projects";
import { getProjectWorkspace } from "@/serverFunctions/clientWorkspaces";
import { clientWorkspacesBuild } from "@/client/features/workspaces/useWorkspaceAccess";
import { switchWorkspace } from "@/client/features/workspaces/WorkspaceSwitcher";

export const Route = createFileRoute("/_project/p/$projectId")({
  // Everything under this subtree fetches its data client-side with
  // react-query, so SSR would only render empty chrome.
  ssr: false,
  component: ProjectLayout,
});

// Redirect-only guard, deliberately NOT a blocking beforeLoad: the shell
// renders immediately while the access check runs in the background, and the
// browser only gets bounced if it lands on a project it can't see (stale
// last-project id, foreign URL). Real authorization is enforced on every data
// call; nothing sensitive renders from this check. In client workspaces the
// project may live in another of the user's workspaces, so the caller shows
// a switch prompt instead of bouncing (returns true while it should).
function useProjectAccessRedirect(projectId: string) {
  const navigate = useNavigate();
  const access = useQuery({
    queryKey: ["projectAccess", projectId],
    queryFn: () => getProjectAccess({ data: { projectId } }),
    // A failed check redirects away — retrying would just delay it.
    retry: false,
    // One check per project per tab; a revoked project still dead-ends at
    // every data call, so there's nothing to re-validate here.
    staleTime: Infinity,
  });
  const error = access.error;
  useEffect(() => {
    if (!error) return;
    if (getErrorCode(error) === "UNAUTHENTICATED") {
      void navigate({
        to: "/sign-in",
        search: getSignInSearch(
          getCurrentAuthRedirectFromHref(window.location.href),
        ),
        replace: true,
      });
      return;
    }
    if (clientWorkspacesBuild()) return;
    void navigate({ to: "/", replace: true });
  }, [error, navigate]);
  return (
    clientWorkspacesBuild() &&
    !!error &&
    getErrorCode(error) !== "UNAUTHENTICATED"
  );
}

function ProjectElsewhere({ projectId }: { projectId: string }) {
  const cache = useQueryClient();
  const [switching, setSwitching] = useState(false);
  const owner = useQuery({
    queryKey: ["projectWorkspace", projectId],
    queryFn: () => getProjectWorkspace({ data: { id: projectId } }),
    retry: false,
  });
  if (owner.isPending) return null;
  const workspace = owner.data;
  return (
    <div className="mx-auto max-w-md space-y-3 p-8 text-center">
      <h1 className="text-xl font-semibold">
        {workspace
          ? "This project is in another workspace"
          : "Project not found"}
      </h1>
      <p className="text-sm text-base-content/70">
        {workspace
          ? `It belongs to ${workspace.name}. Switch workspace to open it.`
          : "It may have been removed, or you may not have access to it."}
      </p>
      <div className="flex justify-center gap-2">
        {workspace ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={switching}
            onClick={() => {
              setSwitching(true);
              void switchWorkspace(
                cache,
                workspace.id,
                `/p/${projectId}`,
              ).catch(() => setSwitching(false));
            }}
          >
            Switch to {workspace.name}
          </button>
        ) : null}
        <Link to="/" className="btn btn-ghost btn-sm">
          Go to your projects
        </Link>
      </div>
    </div>
  );
}

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const authGate = useHostedAuthRouteGuard();
  useOnboardingRedirect();
  const elsewhere = useProjectAccessRedirect(projectId);

  // Remember this as the last-visited project for the landing redirect.
  // Settings and its sub-pages are excluded: editing another project's
  // settings is administration, not a context switch, so it shouldn't change
  // which project the app opens next time. (An explicit choice still counts:
  // the switcher and project creation set it themselves, settings page or not.)
  const isSettingsPage =
    useMatch({
      from: "/_project/p/$projectId/settings",
      shouldThrow: false,
      select: () => true,
    }) ?? false;
  useEffect(() => {
    if (isSettingsPage) return;
    setLastProjectId(projectId);
  }, [projectId, isSettingsPage]);

  if (!authGate.canRenderAuthenticatedContent) {
    return null;
  }

  if (elsewhere)
    return (
      <AuthenticatedAppLayout>
        <ProjectElsewhere projectId={projectId} />
      </AuthenticatedAppLayout>
    );

  return (
    <AuthenticatedAppLayout
      projectId={projectId}
      banner={authGate.isHostedMode ? <FreePlanBanner /> : undefined}
    >
      <Outlet />
    </AuthenticatedAppLayout>
  );
}
