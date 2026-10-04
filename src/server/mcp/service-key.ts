import { env } from "cloudflare:workers";
import { AppError } from "@/server/lib/errors";
import type { ToolContext } from "@/server/mcp/context";
import { MCP_TOOL_CAPABILITIES } from "@/server/mcp/workspace-auth";

// A service key is an ordinary oseo_ API key that the deployment names in
// MCP_SERVICE_KEY_ID (the Better Auth key id, not the secret). It exists for
// an agent calling as a service (Bodkin's @Sherpa, from its Linear board) and
// is narrower than any person's key: one project (MCP_SERVICE_PROJECT_ID),
// and only the "read" tools, so it can never spend credits ("run"), change
// project content ("edit") or settings ("configure"). Every other API key is
// unchanged.
export const SERVICE_CLIENT_ID = "service_key";

export function isServiceKey(keyId: string | undefined | null) {
  const configured = env.MCP_SERVICE_KEY_ID?.trim();
  return Boolean(configured && keyId && keyId === configured);
}

// Read tools that name no project would show another project's data (or the
// list of projects), so a service key may call only whoami without one.
const PROJECTLESS_ALLOWED = new Set(["whoami"]);

export function enforceServiceKeyPolicy(
  toolName: string,
  args: unknown,
  context: ToolContext,
) {
  if (context.auth.clientId !== SERVICE_CLIENT_ID) return;
  if (MCP_TOOL_CAPABILITIES[toolName] !== "read") {
    throw new AppError("FORBIDDEN");
  }
  const projectId =
    typeof args === "object" &&
    args !== null &&
    "projectId" in args &&
    typeof args.projectId === "string"
      ? args.projectId
      : null;
  if (!projectId) {
    if (PROJECTLESS_ALLOWED.has(toolName)) return;
    throw new AppError("FORBIDDEN");
  }
  const bound = env.MCP_SERVICE_PROJECT_ID?.trim();
  // Fail closed: a service key with no bound project reaches nothing.
  if (!bound || projectId !== bound) throw new AppError("FORBIDDEN");
}
