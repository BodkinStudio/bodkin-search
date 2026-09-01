import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ToolAuthContext } from "@/server/mcp/context";
import { growthGetActionsTool } from "@/server/mcp/tools/growth-action-tools";
import type { GrowthMonthlyReportDto } from "@/types/schemas/growth-monthly-reports";
import { growthGetMonthlySummaryTool } from "@/server/mcp/tools/growth-tools";
import { buildSamMcpTools } from "./samChatTools";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  listActions: vi.fn(),
  getGrowthMonthlyReport: vi.fn(),
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

vi.mock("@/server/features/growth/services/GrowthActionsReadService", () => ({
  GrowthActionsReadService: { listActions: mocks.listActions },
}));

vi.mock(
  "@/server/features/growth/services/GrowthMonthlyReportsService",
  () => ({
    GrowthMonthlyReportsService: {
      getGrowthMonthlyReport: mocks.getGrowthMonthlyReport,
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
const summary: GrowthMonthlyReportDto = {
  state: "ready",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  reportTimezone: "Europe/London",
};
const callOptions = { toolCallId: "monthly-summary-call", messages: [] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.withPgClient.mockImplementation((callback: () => unknown) =>
    callback(),
  );
  mocks.getProjectForOrganization.mockResolvedValue({ id: "bound_project" });
  mocks.listActions.mockResolvedValue({
    actions: [],
    limit: 20,
    hasMore: false,
    nextCursor: null,
  });
  mocks.getGrowthMonthlyReport.mockResolvedValue(summary);
});

describe("SAM Growth MCP tools", () => {
  it("binds the shared Action list to the session project and preserves its query", async () => {
    const tools = buildSamMcpTools(authContext, {
      id: "bound_project",
      domain: "example.com",
    });
    const actions = tools.growth_get_actions;

    expect(actions).toBeDefined();
    expect(actions.description).toBe(growthGetActionsTool.config.description);
    expect(actions.inputSchema).toBeInstanceOf(z.ZodObject);
    if (!(actions.inputSchema instanceof z.ZodObject)) {
      throw new Error("Expected SAM to expose a Zod object input schema");
    }
    expect(Object.keys(actions.inputSchema.shape)).toEqual([
      "statuses",
      "category",
      "minPriorityScore",
      "limit",
      "cursor",
    ]);
    expect(actions.inputSchema.shape).not.toHaveProperty("projectId");

    const cursor = {
      createdAt: "2026-08-20T09:00:00.000Z",
      id: "action_cursor",
    };
    const modelInput = actions.inputSchema.parse({
      statuses: ["blocked", "ready", "blocked"],
      category: "  content  ",
      minPriorityScore: 12.5,
      limit: 7,
      cursor,
    });
    if (!actions.execute) throw new Error("Expected an executable SAM tool");
    const result: unknown = await actions.execute(modelInput, callOptions);

    expect(mocks.withPgClient).toHaveBeenCalledTimes(1);
    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      authContext.organizationId,
      "bound_project",
    );
    expect(mocks.listActions).toHaveBeenCalledTimes(1);
    expect(mocks.listActions).toHaveBeenCalledWith({
      projectId: "bound_project",
      statuses: ["ready", "blocked"],
      category: "content",
      minPriorityScore: 12.5,
      limit: 7,
      cursor,
    });
    expect(result).toMatchObject({
      data: {
        page: {
          actions: [],
          limit: 20,
          hasMore: false,
          nextCursor: null,
        },
        meta: {
          projectId: "bound_project",
          url: "https://open-seo.test/p/bound_project/growth#growth-work",
        },
      },
    });
  });

  it("exposes the shared monthly-summary definition without a model-supplied projectId", async () => {
    const tools = buildSamMcpTools(authContext, {
      id: "bound_project",
      domain: "example.com",
    });
    const monthly = tools.growth_get_monthly_summary;

    expect(monthly).toBeDefined();
    expect(monthly.description).toBe(
      growthGetMonthlySummaryTool.config.description,
    );
    expect(monthly.inputSchema).toBeInstanceOf(z.ZodObject);
    if (!(monthly.inputSchema instanceof z.ZodObject)) {
      throw new Error("Expected SAM to expose a Zod object input schema");
    }
    expect(Object.keys(monthly.inputSchema.shape)).toEqual([]);
    expect(monthly.inputSchema.safeParse({}).success).toBe(true);

    if (!monthly.execute) throw new Error("Expected an executable SAM tool");
    const result: unknown = await monthly.execute({}, callOptions);

    expect(mocks.withPgClient).toHaveBeenCalledTimes(1);
    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      authContext.organizationId,
      "bound_project",
    );
    expect(mocks.getGrowthMonthlyReport).toHaveBeenCalledTimes(1);
    expect(mocks.getGrowthMonthlyReport).toHaveBeenCalledWith("bound_project");
    expect(result).toMatchObject({
      data: {
        summary,
        meta: {
          projectId: "bound_project",
          url: "https://open-seo.test/p/bound_project/growth#growth-monthly-summary",
        },
      },
    });
  });
});
