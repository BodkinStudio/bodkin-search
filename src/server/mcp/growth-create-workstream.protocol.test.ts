import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GROWTH_PLAN_WRITE_SCOPE,
  MCP_OAUTH_SUPPORTED_SCOPES,
} from "@/lib/oauth-resource";
import { createWorkersOAuthMcpProps } from "./context";

// The in-memory MCP client handshake takes ~3s; the default 5s budget
// times out whenever other test workers compete for CPU.
const PROTOCOL_TIMEOUT_MS = 20_000;

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  createWorkstream: vi.fn(),
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
vi.mock("@/server/features/growth/services/GrowthPlanService", () => ({
  GrowthPlanService: { createWorkstream: mocks.createWorkstream },
}));
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

const input = {
  projectId: "project_123",
  requestKey: "11111111-1111-4111-8111-111111111111",
  title: "Win Teams comparison searches",
  commercialReason: "These searches are how buyers shortlist us.",
};
const workstream = {
  id: "ws_1",
  position: 1,
  title: input.title,
  commercialReason: input.commercialReason,
  status: "active",
  targetLabel: null,
  targetBaseline: null,
  targetValue: null,
  targetDueOn: null,
  actions: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

afterEach(() => vi.resetAllMocks());

async function connectedClient(scopes: string[]) {
  const { createOpenSeoMcpServer } = await import("./server");
  const server = createOpenSeoMcpServer(
    createWorkersOAuthMcpProps({
      userId: "user_123",
      userEmail: "team@example.com",
      organizationId: "org_123",
      baseUrl: "https://app.example.com",
      clientId: "client_123",
      scopes,
    }),
  );
  const client = new Client({ name: "growth-plan-write", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe("growth_create_workstream MCP protocol", () => {
  it(
    "hides the tool without the operation scope and calls it with explicit consent",
    async () => {
      const readOnly = await connectedClient(["mcp"]);
      try {
        expect(
          (await readOnly.client.listTools()).tools.some(
            ({ name }) => name === "growth_create_workstream",
          ),
        ).toBe(false);
      } finally {
        await readOnly.client.close();
        await readOnly.server.close();
      }

      mocks.getProjectForOrganization.mockResolvedValue({ id: "project_123" });
      mocks.createWorkstream.mockResolvedValue(workstream);
      mocks.incrementSelfHostMcpToolCallCount.mockResolvedValue(undefined);
      mocks.captureServerEvent.mockResolvedValue(undefined);
      mocks.captureServerError.mockResolvedValue(undefined);
      mocks.recordExternalMcpToolCall.mockResolvedValue(undefined);
      const capable = await connectedClient(["mcp", GROWTH_PLAN_WRITE_SCOPE]);
      try {
        expect(
          (await capable.client.listTools()).tools.find(
            ({ name }) => name === "growth_create_workstream",
          ),
        ).toMatchObject({
          name: "growth_create_workstream",
          inputSchema: {
            type: "object",
            required: ["projectId", "requestKey", "title", "commercialReason"],
          },
          outputSchema: { type: "object", required: ["workstream"] },
          annotations: {
            readOnlyHint: false,
            idempotentHint: true,
            destructiveHint: false,
            openWorldHint: false,
          },
        });

        const result = await capable.client.callTool({
          name: "growth_create_workstream",
          arguments: input,
        });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({
          workstream,
          meta: {
            projectId: "project_123",
            url: "https://app.example.com/p/project_123/growth",
          },
        });
        expect(mocks.createWorkstream).toHaveBeenCalledWith({
          ...input,
          actorType: "agent",
          actorId: "user_123",
        });
      } finally {
        await capable.client.close();
        await capable.server.close();
      }
    },
    PROTOCOL_TIMEOUT_MS,
  );
});

describe("self-hosted scope set", () => {
  it("lists every operation-scoped write tool", async () => {
    // What handleSelfHostedOpenSeoMcpRequest grants its operator.
    const selfHosted = await connectedClient([...MCP_OAUTH_SUPPORTED_SCOPES]);
    try {
      const names = (await selfHosted.client.listTools()).tools.map(
        ({ name }) => name,
      );
      expect(names).toEqual(
        expect.arrayContaining([
          "growth_create_workstream",
          "growth_record_change",
        ]),
      );
    } finally {
      await selfHosted.client.close();
      await selfHosted.server.close();
    }
  });
});
