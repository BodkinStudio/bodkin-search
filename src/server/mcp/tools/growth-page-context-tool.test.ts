import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { objectSchema } from "@/server/mcp/output-schemas";
import { makeGrowthPageContextFixture } from "./growth-page-context-test-fixture";
import { growthGetPageContextTool } from "./growth-page-context-tool";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getPageContext: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock("@/server/features/growth/services/GrowthPageContextService", () => ({
  GrowthPageContextService: { getPageContext: mocks.getPageContext },
}));

const projectId = "project_1";
const project = {
  id: projectId,
  organizationId: "org_123",
  name: "Private project name",
  domain: "example.com",
  locationCode: 2826,
  languageCode: "en",
  createdAt: "2026-08-01T09:00:00.000Z",
  archivedAt: null,
  privateMarker: "must-not-cross-service-boundary",
};
const pageContext = makeGrowthPageContextFixture();
const toolContext = makeToolContext({ baseUrl: "https://open-seo.test" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue(project);
  mocks.getPageContext.mockResolvedValue(pageContext);
});

describe("growth_get_page_context MCP tool", () => {
  it("declares one bounded read-only zero-credit page orientation", () => {
    expect(growthGetPageContextTool.name).toBe("growth_get_page_context");
    expect(growthGetPageContextTool.config.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    });
    expect(growthGetPageContextTool.config.description).toMatch(/authorised/i);
    expect(growthGetPageContextTool.config.description).toMatch(/no.*credits/i);
    expect(growthGetPageContextTool.config.description).toMatch(
      /creates or changes nothing/i,
    );
    expect(growthGetPageContextTool.config.description).toMatch(
      /not an atomic historical snapshot/i,
    );
    expect(Object.keys(growthGetPageContextTool.config.inputSchema)).toEqual([
      "projectId",
      "url",
    ]);

    const input = z.object(growthGetPageContextTool.config.inputSchema);
    expect(
      input.safeParse({ projectId, url: "https://example.com/page" }).success,
    ).toBe(true);
    expect(input.safeParse({ projectId, url: "" }).success).toBe(false);
    expect(
      input.safeParse({
        projectId,
        url: `https://example.com/${"x".repeat(2049)}`,
      }).success,
    ).toBe(false);
  });

  it("denies a foreign project before the page-context service is called", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);
    const input = z.object(growthGetPageContextTool.config.inputSchema).parse({
      projectId,
      url: "https://example.com/page",
    });

    await expect(
      growthGetPageContextTool.handler(input, toolContext),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      "org_123",
      projectId,
    );
    expect(mocks.getPageContext).not.toHaveBeenCalled();
  });

  it("passes only authorised identity fields and returns strict context plus standard metadata", async () => {
    const url = "https://example.com/pricing?private=1#private";
    const result = await growthGetPageContextTool.handler(
      { projectId, url },
      toolContext,
    );

    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      "org_123",
      projectId,
    );
    expect(mocks.getPageContext).toHaveBeenCalledTimes(1);
    expect(mocks.getPageContext).toHaveBeenCalledWith(
      { id: projectId, domain: project.domain },
      url,
    );
    expect(result.structuredContent).toEqual({
      context: pageContext,
      meta: {
        projectId,
        url: `https://open-seo.test/p/${projectId}/growth/operations`,
      },
    });

    const output = objectSchema(growthGetPageContextTool.config.outputSchema);
    expect(output.safeParse(result.structuredContent).success).toBe(true);
    expect(
      output.safeParse({
        ...result.structuredContent,
        privateMarker: "leak",
      }).success,
    ).toBe(false);
    expect(
      output.safeParse({
        ...result.structuredContent,
        context: { ...pageContext, organizationId: "private_org" },
      }).success,
    ).toBe(false);
    expect(JSON.stringify(result.structuredContent)).not.toContain(
      project.privateMarker,
    );
    expect(JSON.stringify(result.structuredContent)).not.toContain(
      project.organizationId,
    );
  });

  it("leads with curation/GSC state and summarizes only bounded safe counts", async () => {
    const result = await growthGetPageContextTool.handler(
      { projectId, url: "https://example.com/pricing" },
      toolContext,
    );
    const text = textContent(result);

    expect(text).toContain("Page context: curated and protected.");
    expect(text).toContain("Search Console context: available.");
    expect(text).toContain(
      "1 Recommendations, 1 Actions, 1 Changes, 1 active Measurements",
    );
    expect(text).toContain("structured content");
    expect(text).toContain("current, not an atomic historical snapshot");
    expect(text).not.toContain("private_org");
    expect(text).not.toContain(privateMarkerFromFixture());
  });
});

function privateMarkerFromFixture() {
  return "sc-domain:";
}
