import { env } from "cloudflare:workers";
export function clientWorkspacesEnabled() {
  return env.CLIENT_WORKSPACES_ENABLED === "true";
}
