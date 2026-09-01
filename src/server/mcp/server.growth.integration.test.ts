import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkersOAuthMcpProps } from "@/server/mcp/context";
import { createOpenSeoMcpServer } from "@/server/mcp/server";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getGrowthMonthlyReport: vi.fn(),
  waitUntil: vi.fn(),
  incrementSelfHostMcpToolCallCount: vi.fn(),
  captureServerEvent: vi.fn(),
  captureServerError: vi.fn(),
  recordExternalMcpToolCall: vi.fn(),
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
  "@/server/features/growth/services/GrowthMonthlyReportsService",
  () => ({
    GrowthMonthlyReportsService: {
      getGrowthMonthlyReport: mocks.getGrowthMonthlyReport,
    },
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

beforeEach(() => {
  mocks.getProjectForOrganization.mockResolvedValue({
    id: "project_123",
    domain: "example.com",
  });
  mocks.getGrowthMonthlyReport.mockResolvedValue({
    state: "ready",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    reportTimezone: "Europe/London",
  });
  mocks.incrementSelfHostMcpToolCallCount.mockResolvedValue(undefined);
  mocks.captureServerEvent.mockResolvedValue(undefined);
  mocks.captureServerError.mockResolvedValue(undefined);
  mocks.recordExternalMcpToolCall.mockResolvedValue(undefined);
});

describe("Growth monthly-summary MCP registration", () => {
  it("advertises and invokes the tool through the real in-process server", async () => {
    const authProps = createWorkersOAuthMcpProps({
      userId: "user_123",
      userEmail: "team@example.com",
      organizationId: "org_123",
      baseUrl: "https://app.example.com",
      clientId: null,
      scopes: ["mcp"],
    });
    const server = createOpenSeoMcpServer(authProps);
    const client = new Client({ name: "growth-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    try {
      await client.connect(clientTransport);
      const listing = await client.listTools();
      const tool = listing.tools.find(
        (candidate) => candidate.name === "growth_get_monthly_summary",
      );

      expect(tool).toMatchObject({
        name: "growth_get_monthly_summary",
        inputSchema: {
          type: "object",
          required: ["projectId"],
        },
        outputSchema: {
          type: "object",
          required: ["summary"],
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      });
      expect(tool?.inputSchema.properties).toHaveProperty("projectId");
      expect(tool?.outputSchema?.properties).toHaveProperty("summary");
      expect(tool?.outputSchema?.properties).toHaveProperty("meta");

      const result = await client.callTool({
        name: "growth_get_monthly_summary",
        arguments: { projectId: "project_123" },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        summary: {
          state: "ready",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-31",
          reportTimezone: "Europe/London",
        },
        meta: {
          projectId: "project_123",
          url: "https://app.example.com/p/project_123/growth#growth-monthly-summary",
        },
      });
      expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
        "org_123",
        "project_123",
      );
      expect(mocks.getGrowthMonthlyReport).toHaveBeenCalledWith("project_123");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
