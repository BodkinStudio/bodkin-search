import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ToolAuthContext } from "@/server/mcp/context";
import { growthGetRecentChangesTool } from "@/server/mcp/tools/growth-recent-changes-tool";
import { buildSamMcpTools } from "./samChatTools";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  listRecentChanges: vi.fn(),
  withPgClient: vi.fn((callback: () => unknown) => callback()),
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
  DurableObject: class {
    kind = "mock";
  },
}));

vi.mock("@/db", () => ({ withPgClient: mocks.withPgClient }));

vi.mock("@/server/mcp/instrumentation", () => ({
  instrumentMcpToolHandler:
    (
      _name: string,
      _outputSchema: unknown,
      handler: (...args: never[]) => unknown,
    ) =>
    (...args: never[]) =>
      handler(...args),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock(
  "@/server/features/growth/services/GrowthRecentChangesReadService",
  () => ({
    GrowthRecentChangesReadService: {
      listRecentChanges: mocks.listRecentChanges,
    },
  }),
);

const authContext: ToolAuthContext = {
  userId: "user_1",
  userEmail: "agent@example.com",
  organizationId: "org_1",
  clientId: null,
  scopes: ["mcp"],
  baseUrl: "https://open-seo.test",
};
const callOptions = { toolCallId: "recent-changes-call", messages: [] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.withPgClient.mockImplementation((callback: () => unknown) =>
    callback(),
  );
  mocks.getProjectForOrganization.mockResolvedValue({ id: "bound_project" });
  mocks.listRecentChanges.mockResolvedValue({
    changes: [],
    limit: 20,
    hasMore: false,
    nextCursor: null,
  });
});

describe("SAM recent-change MCP tool", () => {
  it("binds saved manual Change Events to the session project", async () => {
    const tools = buildSamMcpTools(authContext, {
      id: "bound_project",
      domain: "example.com",
    });
    const changes = tools.growth_get_recent_changes;
    expect(changes.description).toBe(
      growthGetRecentChangesTool.config.description,
    );
    if (!(changes.inputSchema instanceof z.ZodObject))
      throw new Error("Expected a Zod object input schema");
    expect(Object.keys(changes.inputSchema.shape)).toEqual(["limit", "cursor"]);
    if (!changes.execute) throw new Error("Expected executable SAM tool");
    const result: unknown = await changes.execute(
      changes.inputSchema.parse({ limit: 7 }),
      callOptions,
    );
    expect(mocks.listRecentChanges).toHaveBeenCalledWith({
      projectId: "bound_project",
      limit: 7,
    });
    expect(result).toMatchObject({
      data: {
        page: { changes: [], limit: 20, hasMore: false, nextCursor: null },
        meta: {
          projectId: "bound_project",
          url: "https://open-seo.test/p/bound_project/growth#growth-change-log",
        },
      },
    });
  });
});
