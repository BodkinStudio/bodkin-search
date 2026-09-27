import { clientWorkspacesEnabled } from "@/server/features/workspaces/workspace-mode";
import { selectWorkspaceContext } from "@/server/features/workspaces/WorkspaceContext";
import { env } from "cloudflare:workers";
import { getAuthMode, isHostedAuthMode } from "@/lib/auth-mode";
import { resolveCloudflareAccessContext } from "./cloudflareAccess";
import { resolveLocalNoAuthContext } from "./delegated";
import { resolveHostedContext } from "./hosted";
import type { EnsuredUserContext } from "./types";

// Resolves the authenticated user for a request's headers across every auth
// mode. Shared by ensureUserMiddleware (server functions) and raw API routes,
// which can't use function middleware.
export async function resolveUserContextFromHeaders(
  headers: Headers,
): Promise<EnsuredUserContext> {
  const authMode = getAuthMode(env.AUTH_MODE);
  const context = await (authMode === "local_noauth"
    ? resolveLocalNoAuthContext()
    : isHostedAuthMode(authMode)
      ? resolveHostedContext(headers)
      : resolveCloudflareAccessContext(headers));
  return clientWorkspacesEnabled()
    ? selectWorkspaceContext(context, headers)
    : context;
}
