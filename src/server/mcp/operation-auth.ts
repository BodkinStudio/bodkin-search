import { AppError } from "@/server/lib/errors";
import { MCP_SCOPE } from "@/lib/oauth-resource";
import {
  MCP_AUTH_CONTEXT_PROP,
  type McpProps,
  type ToolContext,
} from "./context";

export function hasMcpOperationScope(props: McpProps, scope: string) {
  const scopes = props[MCP_AUTH_CONTEXT_PROP].scopes ?? [];
  return scopes.includes(MCP_SCOPE) && scopes.includes(scope);
}

export function withMcpOperationScope<TArgs, TResult>(
  scope: string,
  handler: (args: TArgs, context: ToolContext) => Promise<TResult> | TResult,
) {
  return (args: TArgs, context: ToolContext) => {
    if (
      !context.auth.scopes.includes(MCP_SCOPE) ||
      !context.auth.scopes.includes(scope)
    )
      throw new AppError("FORBIDDEN");
    return handler(args, context);
  };
}
