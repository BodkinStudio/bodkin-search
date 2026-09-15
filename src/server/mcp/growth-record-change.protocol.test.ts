import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GROWTH_CHANGE_CREATE_SCOPE } from "@/lib/oauth-resource";
import { createWorkersOAuthMcpProps } from "./context";

// The in-memory MCP client handshake takes ~3s; the default 5s budget
// times out whenever other test workers compete for CPU.
const PROTOCOL_TIMEOUT_MS = 20_000;

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  recordChange: vi.fn(),
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
vi.mock("@/server/features/growth/services/GrowthRecordChangeService", () => ({
  GrowthRecordChangeService: { recordChange: mocks.recordChange },
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
  changeType: "content_updated",
  description: "Updated pricing copy.",
  happenedAt: "2026-01-15T09:30:00.000Z",
  urls: ["https://example.com/pricing"],
};
const change = {
  id: "event_1",
  source: "manual",
  changeType: "content_updated",
  description: "Updated pricing copy.",
  descriptionRedacted: false,
  descriptionTruncated: false,
  happenedAt: "2026-01-15T09:30:00.000Z",
  recordedAt: "2026-01-15T09:31:00.000Z",
  urlCount: 1,
  displayUrls: [
    {
      value: "https://example.com/pricing",
      queryOrFragmentOmitted: false,
      withheld: false,
    },
  ],
  displayUrlsOmitted: false,
  displayUrlsWithheld: false,
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
  const client = new Client({ name: "growth-write", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe("growth_record_change MCP protocol", () => {
  it(
    "hides the tool without the operation scope and calls it with explicit consent",
    async () => {
      const readOnly = await connectedClient(["mcp"]);
      try {
        expect(
          (await readOnly.client.listTools()).tools.some(
            ({ name }) => name === "growth_record_change",
          ),
        ).toBe(false);
      } finally {
        await readOnly.client.close();
        await readOnly.server.close();
      }

      mocks.getProjectForOrganization.mockResolvedValue({ id: "project_123" });
      mocks.recordChange.mockResolvedValue(change);
      mocks.incrementSelfHostMcpToolCallCount.mockResolvedValue(undefined);
      mocks.captureServerEvent.mockResolvedValue(undefined);
      mocks.captureServerError.mockResolvedValue(undefined);
      mocks.recordExternalMcpToolCall.mockResolvedValue(undefined);
      const capable = await connectedClient([
        "mcp",
        GROWTH_CHANGE_CREATE_SCOPE,
      ]);
      try {
        const tool = (await capable.client.listTools()).tools.find(
          ({ name }) => name === "growth_record_change",
        );
        expect(tool).toMatchObject({
          name: "growth_record_change",
          inputSchema: {
            type: "object",
            required: [
              "projectId",
              "requestKey",
              "changeType",
              "description",
              "happenedAt",
              "urls",
            ],
          },
          outputSchema: { type: "object", required: ["change"] },
          annotations: {
            readOnlyHint: false,
            idempotentHint: true,
            destructiveHint: false,
            openWorldHint: false,
          },
        });

        const result = await capable.client.callTool({
          name: "growth_record_change",
          arguments: input,
        });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({
          change,
          meta: {
            projectId: "project_123",
            url: "https://app.example.com/p/project_123/growth/operations#growth-change-log",
          },
        });
        expect(mocks.recordChange).toHaveBeenCalledWith(
          input,
          expect.objectContaining({
            userId: "user_123",
            clientId: "client_123",
            scopes: ["mcp", GROWTH_CHANGE_CREATE_SCOPE],
          }),
        );
      } finally {
        await capable.client.close();
        await capable.server.close();
      }
    },
    PROTOCOL_TIMEOUT_MS,
  );
});
