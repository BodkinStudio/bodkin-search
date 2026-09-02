const MCP_RESOURCE_PATH = "/mcp";
export const MCP_SCOPE = "mcp";
export const GROWTH_CHANGE_CREATE_SCOPE = "growth:change:create";
/** Default scopes intentionally exclude every operation-specific write scope. */
export const MCP_OAUTH_SCOPES = ["offline_access", MCP_SCOPE];
export const MCP_OAUTH_SUPPORTED_SCOPES = [
  ...MCP_OAUTH_SCOPES,
  GROWTH_CHANGE_CREATE_SCOPE,
];

export function getMcpResource(baseUrl: string) {
  return new URL(MCP_RESOURCE_PATH, baseUrl).toString();
}
