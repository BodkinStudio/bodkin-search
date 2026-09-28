import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ToolAuthContext } from "@/server/mcp/context";
import { growthGetMeasurementsTool } from "@/server/mcp/tools/growth-measurements-tool";
import { buildSamMcpTools } from "./samChatTools";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  listMeasurements: vi.fn(),
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
    (_name: string, _schema: unknown, handler: (...args: never[]) => unknown) =>
    (...args: never[]) =>
      handler(...args),
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock(
  "@/server/features/growth/services/GrowthMeasurementsReadService",
  () => ({
    GrowthMeasurementsReadService: { listMeasurements: mocks.listMeasurements },
  }),
);

const context: ToolAuthContext = {
  userId: "user_1",
  userEmail: "agent@example.com",
  organizationId: "org_1",
  clientId: null,
  scopes: ["mcp"],
  baseUrl: "https://open-seo.test",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.withPgClient.mockImplementation((callback: () => unknown) =>
    callback(),
  );
  mocks.getProjectForOrganization.mockResolvedValue({ id: "bound_project" });
  mocks.listMeasurements.mockResolvedValue({
    measurements: [],
    limit: 20,
    hasMore: false,
    nextCursor: null,
  });
});

describe("SAM Measurement MCP tool", () => {
  it("binds saved Measurement Plans to the session project", async () => {
    const tool = buildSamMcpTools(context, {
      id: "bound_project",
      domain: "example.com",
    }).growth_get_measurements;
    expect(tool.description).toBe(growthGetMeasurementsTool.config.description);
    if (!(tool.inputSchema instanceof z.ZodObject) || !tool.execute)
      throw new Error("Expected executable bound tool");
    expect(Object.keys(tool.inputSchema.shape)).toEqual([
      "statuses",
      "limit",
      "cursor",
    ]);
    await tool.execute(tool.inputSchema.parse({ limit: 7 }), {
      toolCallId: "measurements",
      messages: [],
    });
    expect(mocks.listMeasurements).toHaveBeenCalledWith({
      projectId: "bound_project",
      limit: 7,
    });
  });
});
