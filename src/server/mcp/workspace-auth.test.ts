import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeMcpToolCall } from "./workspace-auth";
import { makeToolContext } from "./tools/tool-test-support";

const { requireWorkspaceMembership } = vi.hoisted(() => ({
  requireWorkspaceMembership: vi.fn(),
}));

vi.mock("@/server/features/workspaces/WorkspaceAccess", () => ({
  clientWorkspacesEnabled: () => true,
  requireWorkspaceMembership,
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectById: async (id: string) =>
      id === "client_project" ? { organizationId: "client_ws" } : null,
  },
}));

const context = makeToolContext({ organizationId: "home_ws" });

describe("MCP tool authorization in client workspaces", () => {
  beforeEach(() => {
    requireWorkspaceMembership.mockResolvedValue({});
  });

  it("checks the tool's capability in the workspace that owns the project", async () => {
    const scoped = await authorizeMcpToolCall(
      "research_keywords",
      { projectId: "client_project" },
      context,
    );

    expect(requireWorkspaceMembership).toHaveBeenCalledWith(
      "user_123",
      "client_ws",
      "run",
    );
    expect(scoped.auth.organizationId).toBe("client_ws");
  });

  it("refuses a tool that has no capability (fail closed)", async () => {
    await expect(
      authorizeMcpToolCall("unreviewed_tool", {}, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
