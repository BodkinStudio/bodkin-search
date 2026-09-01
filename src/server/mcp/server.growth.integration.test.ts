/* eslint-disable max-lines -- one real-protocol suite covers all shared Growth registrations */
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkersOAuthMcpProps } from "@/server/mcp/context";
import { createOpenSeoMcpServer } from "@/server/mcp/server";
import { makeGrowthPageContextFixture } from "@/server/mcp/tools/growth-page-context-test-fixture";
import { makeGrowthActionDetailFixture } from "@/server/mcp/tools/growth-action-detail-test-fixture";
import { makeGrowthProjectSummaryFixture } from "@/server/mcp/tools/growth-project-summary-test-fixture";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getGrowthMonthlyReport: vi.fn(),
  getPageContext: vi.fn(),
  getProjectSummary: vi.fn(),
  listActions: vi.fn(),
  getActionDetail: vi.fn(),
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

vi.mock("@/server/features/growth/services/GrowthPageContextService", () => ({
  GrowthPageContextService: {
    getPageContext: mocks.getPageContext,
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

vi.mock("@/server/features/growth/services/GrowthActionsReadService", () => ({
  GrowthActionsReadService: {
    listActions: mocks.listActions,
  },
}));

vi.mock("@/server/features/growth/services/GrowthActionDetailService", () => ({
  GrowthActionDetailService: { getAction: mocks.getActionDetail },
}));

vi.mock(
  "@/server/features/growth/services/GrowthProjectSummaryService",
  () => ({
    GrowthProjectSummaryService: {
      getProjectSummary: mocks.getProjectSummary,
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
    name: "Example project",
    domain: "example.com",
    locationCode: 2826,
    languageCode: "en",
    createdAt: "2026-08-01T09:00:00.000Z",
  });
  mocks.getGrowthMonthlyReport.mockResolvedValue({
    state: "ready",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    reportTimezone: "Europe/London",
  });
  mocks.listActions.mockResolvedValue({
    actions: [
      {
        id: "action_123",
        title: "Repair pricing visibility",
        titleRedacted: false,
        titleTruncated: false,
        category: "content",
        categoryRedacted: false,
        categoryTruncated: false,
        description: "Restore measurable demand for the pricing page.",
        descriptionRedacted: false,
        descriptionTruncated: false,
        priorityScore: 10,
        status: "ready",
        version: 1,
        dueAt: "2026-09-30T12:00:00.000Z",
        createdAt: "2026-08-31T12:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
        targetCount: 1,
        displayTargets: [
          {
            type: "url",
            value: "https://example.com/pricing",
            queryOrFragmentOmitted: true,
            withheld: false,
          },
        ],
        displayTargetsOmitted: false,
        displayTargetsWithheld: false,
      },
    ],
    limit: 2,
    hasMore: true,
    nextCursor: {
      createdAt: "2026-08-31T12:00:00.000Z",
      id: "action_123",
    },
  });
  mocks.getActionDetail.mockResolvedValue(makeGrowthActionDetailFixture());
  mocks.getProjectSummary.mockResolvedValue(makeGrowthProjectSummaryFixture());
  mocks.getPageContext.mockResolvedValue(makeGrowthPageContextFixture());
  mocks.incrementSelfHostMcpToolCallCount.mockResolvedValue(undefined);
  mocks.captureServerEvent.mockResolvedValue(undefined);
  mocks.captureServerError.mockResolvedValue(undefined);
  mocks.recordExternalMcpToolCall.mockResolvedValue(undefined);
});

describe("Growth page-context MCP registration", () => {
  it("advertises and invokes the shared tool through the real in-process protocol", async () => {
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
        (candidate) => candidate.name === "growth_get_page_context",
      );

      expect(tool).toMatchObject({
        name: "growth_get_page_context",
        inputSchema: {
          type: "object",
          required: ["projectId", "url"],
        },
        outputSchema: {
          type: "object",
          required: ["context"],
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      });
      expect(tool?.inputSchema.properties).toHaveProperty("projectId");
      expect(tool?.inputSchema.properties).toHaveProperty("url");
      expect(tool?.outputSchema?.properties).toHaveProperty("context");
      expect(tool?.outputSchema?.properties).toHaveProperty("meta");

      const requestedUrl = "https://example.com/pricing?plan=agency";
      const result = await client.callTool({
        name: "growth_get_page_context",
        arguments: { projectId: "project_123", url: requestedUrl },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        context: {
          consistency: "current_not_snapshot",
          page: {
            identityScopes: [
              "key_page_exact",
              "growth_workflow_host_path",
              "gsc_parsed_requested_url",
              "rank_common_host_path_variants",
            ],
          },
          searchPerformance: { state: "available" },
        },
        meta: {
          projectId: "project_123",
          url: "https://app.example.com/p/project_123/growth",
        },
      });
      expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
        "org_123",
        "project_123",
      );
      expect(mocks.getPageContext).toHaveBeenCalledWith(
        { id: "project_123", domain: "example.com" },
        requestedUrl,
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});

describe("Growth project-summary MCP registration", () => {
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
        (candidate) => candidate.name === "growth_get_project_summary",
      );

      expect(tool).toMatchObject({
        name: "growth_get_project_summary",
        inputSchema: { type: "object", required: ["projectId"] },
        outputSchema: { type: "object", required: ["summary"] },
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
        name: "growth_get_project_summary",
        arguments: { projectId: "project_123" },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        summary: {
          consistency: "current_not_snapshot",
          freshness: { scope: "saved_growth_signals" },
        },
        meta: {
          projectId: "project_123",
          url: "https://app.example.com/p/project_123/growth",
        },
      });
      expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
        "org_123",
        "project_123",
      );
      expect(mocks.getProjectSummary).toHaveBeenCalledWith({
        id: "project_123",
        name: "Example project",
        domain: "example.com",
        locationCode: 2826,
        languageCode: "en",
        createdAt: "2026-08-01T09:00:00.000Z",
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
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

describe("Growth Action MCP registration", () => {
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
        (candidate) => candidate.name === "growth_get_actions",
      );

      expect(tool).toMatchObject({
        name: "growth_get_actions",
        inputSchema: {
          type: "object",
          required: ["projectId"],
        },
        outputSchema: {
          type: "object",
          required: ["page"],
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      });
      expect(tool?.inputSchema.properties).toHaveProperty("projectId");
      expect(tool?.inputSchema.properties).toHaveProperty("cursor");
      expect(tool?.outputSchema?.properties).toHaveProperty("page");
      expect(tool?.outputSchema?.properties).toHaveProperty("meta");

      const cursor = {
        createdAt: "2026-09-01T12:00:00.000Z",
        id: "action_older",
      };
      const result = await client.callTool({
        name: "growth_get_actions",
        arguments: {
          projectId: "project_123",
          statuses: ["ready"],
          category: "content",
          minPriorityScore: 5,
          limit: 2,
          cursor,
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        page: {
          actions: [
            {
              id: "action_123",
              status: "ready",
              displayTargets: [
                {
                  type: "url",
                  value: "https://example.com/pricing",
                },
              ],
            },
          ],
          hasMore: true,
          nextCursor: {
            createdAt: "2026-08-31T12:00:00.000Z",
            id: "action_123",
          },
        },
        meta: {
          projectId: "project_123",
          url: "https://app.example.com/p/project_123/growth#growth-work",
        },
      });
      expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
        "org_123",
        "project_123",
      );
      expect(mocks.listActions).toHaveBeenCalledWith({
        projectId: "project_123",
        statuses: ["ready"],
        category: "content",
        minPriorityScore: 5,
        limit: 2,
        cursor,
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});

describe("Growth Action detail MCP registration", () => {
  it("advertises and invokes the shared detail tool through the real in-process protocol", async () => {
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
        (candidate) => candidate.name === "growth_get_action",
      );
      expect(tool).toMatchObject({
        name: "growth_get_action",
        inputSchema: { type: "object", required: ["projectId", "actionId"] },
        outputSchema: { type: "object", required: ["action"] },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      });

      const result = await client.callTool({
        name: "growth_get_action",
        arguments: { projectId: "project_123", actionId: "action_123" },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        action: {
          consistency: "current_not_snapshot",
          action: { id: "action_123" },
        },
        meta: {
          projectId: "project_123",
          url: "https://app.example.com/p/project_123/growth#growth-work",
        },
      });
      expect(mocks.getActionDetail).toHaveBeenCalledWith({
        projectId: "project_123",
        actionId: "action_123",
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
