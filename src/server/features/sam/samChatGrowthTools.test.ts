import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ToolAuthContext } from "@/server/mcp/context";
import type { GrowthMonthlyReportDto } from "@/types/schemas/growth-monthly-reports";
import { growthGetMonthlySummaryTool } from "@/server/mcp/tools/growth-tools";
import { buildSamMcpTools } from "./samChatTools";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
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
  mocks.getGrowthMonthlyReport.mockResolvedValue(summary);
});

describe("SAM Growth MCP tools", () => {
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
