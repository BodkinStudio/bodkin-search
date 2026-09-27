import { env } from "cloudflare:workers";
import { AppError } from "@/server/lib/errors";
export function clientWorkspacesEnabled() {
  return env.CLIENT_WORKSPACES_ENABLED === "true";
}
// Paid/agent operations must gain explicit actor + payer authorization before
// being enabled for client workspaces. This also covers resumed jobs.
export function requireLegacyAutomationMode() {
  if (clientWorkspacesEnabled())
    throw new AppError(
      "FORBIDDEN",
      "Automation and paid actions are not enabled in client workspaces.",
    );
}
