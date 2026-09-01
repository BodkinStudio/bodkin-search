import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { objectSchema } from "@/server/mcp/output-schemas";
import { makeGrowthActionDetailFixture } from "./growth-action-detail-test-fixture";
import { growthGetActionTool } from "./growth-action-detail-tool";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getAction: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock("@/server/features/growth/services/GrowthActionDetailService", () => ({
  GrowthActionDetailService: { getAction: mocks.getAction },
}));

const projectId = "project_1";
const actionId = "action_1";
const context = makeToolContext({ baseUrl: "https://open-seo.test" });

function input(value: Record<string, unknown>) {
  return z.strictObject(growthGetActionTool.config.inputSchema).parse(value);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: projectId });
});

describe("growth_get_action MCP tool", () => {
  it("declares one strict, read-only saved-data request", () => {
    expect(growthGetActionTool.name).toBe("growth_get_action");
    expect(growthGetActionTool.config.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    });
    expect(Object.keys(growthGetActionTool.config.inputSchema)).toEqual([
      "projectId",
      "actionId",
    ]);
    expect(growthGetActionTool.config.description).toMatch(/saved/i);
    expect(growthGetActionTool.config.description).toMatch(/zero credits/i);
    expect(growthGetActionTool.config.description).toMatch(
      /no provider calls/i,
    );
    expect(input({ projectId, actionId })).toEqual({ projectId, actionId });
    expect(() => input({ projectId, actionId, extra: true })).toThrow();
  });

  it("authorizes before the detail read", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);

    await expect(
      growthGetActionTool.handler(input({ projectId, actionId }), context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.getAction).not.toHaveBeenCalled();
  });

  it("returns standard metadata and a non-causal bounded-chain summary", async () => {
    const detail = makeGrowthActionDetailFixture();
    mocks.getAction.mockResolvedValue(detail);

    const result = await growthGetActionTool.handler(
      input({ projectId, actionId }),
      context,
    );

    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      "org_123",
      projectId,
    );
    expect(mocks.getAction).toHaveBeenCalledWith({ projectId, actionId });
    expect(result.structuredContent).toEqual({
      action: detail,
      meta: {
        projectId,
        url: `https://open-seo.test/p/${projectId}/growth#growth-work`,
      },
    });
    expect(textContent(result)).toContain(detail.action.title.value);
    expect(textContent(result)).toContain(detail.action.status);
    expect(textContent(result)).toMatch(/structured content/i);
    expect(textContent(result)).toMatch(/not a historical snapshot/i);
    expect(textContent(result)).toMatch(/do not establish causality/i);

    const output = objectSchema(growthGetActionTool.config.outputSchema);
    expect(output.safeParse(result.structuredContent).success).toBe(true);
    expect(
      output.safeParse({
        ...result.structuredContent,
        action: { ...detail, privateActorId: "private" },
      }).success,
    ).toBe(false);
  });
});
