import { describe, expect, it, vi } from "vitest";
import { GROWTH_CHANGE_CREATE_SCOPE } from "@/lib/oauth-resource";
import { createWorkersOAuthMcpProps } from "./context";
import { makeToolContext } from "./tools/tool-test-support";
import { hasMcpOperationScope, withMcpOperationScope } from "./operation-auth";

describe("withMcpOperationScope", () => {
  it("fails before its wrapped handler without both base and operation scopes", async () => {
    const handler = vi.fn((): void => undefined);
    const wrapped = withMcpOperationScope(GROWTH_CHANGE_CREATE_SCOPE, handler);
    expect(() => wrapped({}, makeToolContext({ scopes: ["mcp"] }))).toThrow(
      "FORBIDDEN",
    );
    expect(handler).not.toHaveBeenCalled();

    expect(() =>
      wrapped({}, makeToolContext({ scopes: [GROWTH_CHANGE_CREATE_SCOPE] })),
    ).toThrow("FORBIDDEN");
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows the wrapped handler only with the explicit operation scope", async () => {
    const handler = vi.fn(async (): Promise<string> => "ok");
    const wrapped = withMcpOperationScope(GROWTH_CHANGE_CREATE_SCOPE, handler);
    const context = makeToolContext({
      scopes: ["mcp", GROWTH_CHANGE_CREATE_SCOPE],
    });

    await expect(wrapped({ value: 1 }, context)).resolves.toBe("ok");
    expect(handler).toHaveBeenCalledWith({ value: 1 }, context);
  });

  it("uses the same fail-closed rule for conditional registration", () => {
    const props = (scopes: string[]) =>
      createWorkersOAuthMcpProps({
        userId: "user_1",
        userEmail: "user@example.com",
        organizationId: "org_1",
        baseUrl: "https://app.openseo.so",
        clientId: "client_1",
        scopes,
      });

    expect(
      hasMcpOperationScope(props(["mcp"]), GROWTH_CHANGE_CREATE_SCOPE),
    ).toBe(false);
    expect(
      hasMcpOperationScope(
        createWorkersOAuthMcpProps({
          userId: "user_1",
          userEmail: "user@example.com",
          organizationId: "org_1",
          baseUrl: "https://app.openseo.so",
        }),
        GROWTH_CHANGE_CREATE_SCOPE,
      ),
    ).toBe(false);
    expect(
      hasMcpOperationScope(
        props([GROWTH_CHANGE_CREATE_SCOPE]),
        GROWTH_CHANGE_CREATE_SCOPE,
      ),
    ).toBe(false);
    expect(
      hasMcpOperationScope(
        props(["mcp", GROWTH_CHANGE_CREATE_SCOPE]),
        GROWTH_CHANGE_CREATE_SCOPE,
      ),
    ).toBe(true);
  });
});
