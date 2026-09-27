import { clientWorkspacesEnabled } from "@/server/features/workspaces/workspace-mode";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getAuth, hasHostedAuthConfig } from "@/lib/auth";
import { isHostedAuthMode } from "@/lib/auth-mode";

async function handleAuthRequest(request: Request) {
  if (!isHostedAuthMode(env.AUTH_MODE)) {
    return new Response("Not found", {
      status: 404,
    });
  }

  if (!hasHostedAuthConfig()) {
    return new Response("Missing Better Auth hosted configuration", {
      status: 500,
    });
  }

  // Client workspaces manage membership in workspace settings and sign in by
  // email, so Better Auth's organization and social sign-in routes stay shut.
  // oauth2/* stays open: it carries MCP sign-in and the Google integration
  // links, and every tool call and project connection is still checked
  // against the member's workspace role.
  if (
    clientWorkspacesEnabled() &&
    /^\/api\/auth\/(organization\/|link-social|sign-in\/social)/.test(
      new URL(request.url).pathname,
    )
  )
    return new Response("Use workspace settings to manage membership.", {
      status: 403,
    });
  const auth = getAuth();
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return handleAuthRequest(request);
      },
      POST: async ({ request }: { request: Request }) => {
        return handleAuthRequest(request);
      },
    },
  },
});
