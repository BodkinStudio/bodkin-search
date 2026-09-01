import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { growthGetRecentChangesTool } from "./growth-recent-changes-tool";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  listRecentChanges: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock(
  "@/server/features/growth/services/GrowthRecentChangesReadService",
  () => ({
    GrowthRecentChangesReadService: {
      listRecentChanges: mocks.listRecentChanges,
    },
  }),
);

const projectId = "project_1";
const context = makeToolContext({ baseUrl: "https://open-seo.test" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: projectId });
  mocks.listRecentChanges.mockResolvedValue({
    changes: [],
    limit: 20,
    hasMore: false,
    nextCursor: null,
  });
});

describe("growth_get_recent_changes MCP tool", () => {
  it("is a strict zero-credit manual saved-data read", () => {
    expect(growthGetRecentChangesTool.config.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    });
    expect(growthGetRecentChangesTool.config.description).toMatch(
      /zero credits/i,
    );
    expect(growthGetRecentChangesTool.config.description).toMatch(
      /no provider calls/i,
    );
    expect(growthGetRecentChangesTool.config.description).toMatch(/manual/i);
    expect(Object.keys(growthGetRecentChangesTool.config.inputSchema)).toEqual([
      "projectId",
      "limit",
      "cursor",
    ]);
  });

  it("authorizes before reading and points to the manual-log boundary", async () => {
    const input = z
      .object(growthGetRecentChangesTool.config.inputSchema)
      .parse({ projectId });
    mocks.getProjectForOrganization.mockResolvedValue(null);
    await expect(
      growthGetRecentChangesTool.handler(input, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listRecentChanges).not.toHaveBeenCalled();

    mocks.getProjectForOrganization.mockResolvedValue({ id: projectId });
    const result = await growthGetRecentChangesTool.handler(input, context);
    expect(mocks.listRecentChanges).toHaveBeenCalledWith(input);
    expect(result.structuredContent).toMatchObject({
      meta: {
        url: "https://open-seo.test/p/project_1/growth#growth-change-log",
      },
    });
    expect(textContent(result)).toMatch(/saved manual Change Event/i);
    expect(textContent(result)).toMatch(/supplied event timestamp/i);
  });
});
