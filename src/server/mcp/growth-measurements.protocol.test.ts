import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkersOAuthMcpProps } from "./context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  listMeasurements: vi.fn(),
  waitUntil: vi.fn(),
  captureServerEvent: vi.fn(),
  captureServerError: vi.fn(),
  recordExternalMcpToolCall: vi.fn(),
  incrementSelfHostMcpToolCallCount: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({
  env: {},
  waitUntil: mocks.waitUntil,
  DurableObject: class {
    kind = "mock";
  },
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
vi.mock("@/server/features/activation/mcpActivation", () => ({
  recordExternalMcpToolCall: mocks.recordExternalMcpToolCall,
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
  captureServerError: mocks.captureServerError,
}));
vi.mock("@/server/lib/self-host-telemetry", () => ({
  incrementSelfHostMcpToolCallCount: mocks.incrementSelfHostMcpToolCallCount,
}));

afterEach(() => vi.resetAllMocks());

describe("growth_get_measurements MCP protocol", () => {
  it("advertises strict saved-data input/output and invokes the authorized shared service", async () => {
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_123" });
    mocks.listMeasurements.mockResolvedValue({
      measurements: [],
      limit: 20,
      hasMore: false,
      nextCursor: null,
    });
    mocks.incrementSelfHostMcpToolCallCount.mockResolvedValue(undefined);
    mocks.captureServerEvent.mockResolvedValue(undefined);
    mocks.captureServerError.mockResolvedValue(undefined);
    mocks.recordExternalMcpToolCall.mockResolvedValue(undefined);
    const { createOpenSeoMcpServer } = await import("./server");
    const server = createOpenSeoMcpServer(
      createWorkersOAuthMcpProps({
        userId: "user",
        userEmail: "team@example.com",
        organizationId: "org",
        baseUrl: "https://app.example.com",
        clientId: null,
        scopes: ["mcp"],
      }),
    );
    const client = new Client({
      name: "growth-measurements",
      version: "1.0.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    try {
      await client.connect(clientTransport);
      const tool = (await client.listTools()).tools.find(
        (value) => value.name === "growth_get_measurements",
      );
      expect(tool).toMatchObject({
        name: "growth_get_measurements",
        inputSchema: { type: "object", required: ["projectId"] },
        outputSchema: { type: "object", required: ["page"] },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      });
      const cursor = { createdAt: "2026-01-01T01:00:00+01:00", id: "plan_1" };
      const result = await client.callTool({
        name: "growth_get_measurements",
        arguments: { projectId: "project_123", limit: 2, cursor },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        page: { measurements: [], limit: 20, hasMore: false, nextCursor: null },
        meta: {
          projectId: "project_123",
          url: "https://app.example.com/p/project_123/growth#growth-work",
        },
      });
      expect(mocks.listMeasurements).toHaveBeenCalledWith({
        projectId: "project_123",
        limit: 2,
        cursor,
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
