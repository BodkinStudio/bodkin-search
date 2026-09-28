import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";
import { handleLinkedInOAuthCallback } from "@/server/features/linkedin/oauth";
import { getPublicOrigin } from "@/server/mcp/public-origin";
export const Route = createFileRoute("/api/linkedin/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getAuth().api.getSession({
          headers: request.headers,
        });
        if (!session?.user?.id)
          return new Response("Sign in before completing LinkedIn OAuth", {
            status: 401,
          });
        return handleLinkedInOAuthCallback(
          request,
          session.user.id,
          getPublicOrigin(request),
        );
      },
    },
  },
});
