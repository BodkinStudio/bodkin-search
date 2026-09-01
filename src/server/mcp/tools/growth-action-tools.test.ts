import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { objectSchema } from "@/server/mcp/output-schemas";
import type {
  GrowthActionReadDto,
  GrowthActionsReadPageDto,
  GrowthActionsReadRequest,
} from "@/types/schemas/growth-action-reads";
import { growthGetActionsTool } from "./growth-action-tools";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  listActions: vi.fn(),
  createAction: vi.fn(),
  transitionAction: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock("@/server/features/growth/services/GrowthActionsReadService", () => ({
  GrowthActionsReadService: { listActions: mocks.listActions },
}));

vi.mock("@/server/features/growth/services/GrowthActionsService", () => ({
  GrowthActionsService: {
    createAction: mocks.createAction,
    transitionAction: mocks.transitionAction,
  },
}));

const projectId = "project_1";
const context = makeToolContext({ baseUrl: "https://open-seo.test" });
const cursor = {
  createdAt: "2026-08-20T09:00:00.000Z",
  id: "action_cursor",
} as const;
const action: GrowthActionReadDto = {
  id: "action_1",
  title: "Improve pricing page",
  titleRedacted: true,
  titleTruncated: false,
  category: "content",
  categoryRedacted: false,
  categoryTruncated: false,
  description: "Clarify the pricing proposition and supporting proof.",
  descriptionRedacted: false,
  descriptionTruncated: false,
  priorityScore: 42,
  status: "ready",
  version: 3,
  dueAt: "2026-09-15T09:00:00.000Z",
  createdAt: "2026-08-21T09:00:00.000Z",
  updatedAt: "2026-08-22T09:00:00.000Z",
  targetCount: 2,
  displayTargets: [
    {
      type: "url",
      value: "https://example.com/pricing",
      queryOrFragmentOmitted: true,
      withheld: false,
    },
    {
      type: "keyword",
      value: "pricing software",
      redacted: false,
      truncated: false,
    },
  ],
  displayTargetsOmitted: false,
  displayTargetsWithheld: false,
};

function parseInput(input: Record<string, unknown>): GrowthActionsReadRequest {
  return z.object(growthGetActionsTool.config.inputSchema).parse(input);
}

function page(
  overrides: Partial<GrowthActionsReadPageDto> = {},
): GrowthActionsReadPageDto {
  return {
    actions: [action],
    limit: 12,
    hasMore: true,
    nextCursor: cursor,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: projectId });
});

describe("growth_get_actions MCP tool", () => {
  it("shares the bounded query shape and declares a zero-credit saved-data read", () => {
    expect(growthGetActionsTool.name).toBe("growth_get_actions");
    expect(growthGetActionsTool.config.annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    });
    expect(growthGetActionsTool.config.description).toMatch(/saved/i);
    expect(growthGetActionsTool.config.description).toMatch(
      /(?:zero|no) credits/i,
    );
    expect(growthGetActionsTool.config.description).toMatch(
      /no provider calls/i,
    );
    expect(growthGetActionsTool.config.description).toMatch(
      /never creates? or changes?/i,
    );
    expect(Object.keys(growthGetActionsTool.config.inputSchema)).toEqual([
      "projectId",
      "statuses",
      "category",
      "minPriorityScore",
      "limit",
      "cursor",
    ]);
    expect(
      parseInput({
        projectId,
        statuses: ["ready", "approved", "ready"],
      }),
    ).toEqual({
      projectId,
      statuses: ["approved", "ready"],
      limit: 20,
    });
  });

  it("denies a foreign project before the Action read or any mutation", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);
    const input = parseInput({ projectId });

    await expect(
      growthGetActionsTool.handler(input, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.listActions).not.toHaveBeenCalled();
    expect(mocks.createAction).not.toHaveBeenCalled();
    expect(mocks.transitionAction).not.toHaveBeenCalled();
  });

  it("preserves every normalized filter and cursor in one strict read", async () => {
    const input = parseInput({
      projectId,
      statuses: ["blocked", "ready", "blocked"],
      category: "  content  ",
      minPriorityScore: 10.5,
      limit: 12,
      cursor,
    });
    const resultPage = page();
    mocks.listActions.mockResolvedValue(resultPage);

    const result = await growthGetActionsTool.handler(input, context);

    expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
      "org_123",
      projectId,
    );
    expect(mocks.listActions).toHaveBeenCalledTimes(1);
    expect(mocks.listActions).toHaveBeenCalledWith({
      projectId,
      statuses: ["ready", "blocked"],
      category: "content",
      minPriorityScore: 10.5,
      limit: 12,
      cursor,
    });
    expect(mocks.createAction).not.toHaveBeenCalled();
    expect(mocks.transitionAction).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({
      page: resultPage,
      meta: {
        projectId,
        url: `https://open-seo.test/p/${projectId}/growth#growth-work`,
      },
    });

    const outputSchema = objectSchema(growthGetActionsTool.config.outputSchema);
    const parsedOutput = outputSchema.safeParse(result.structuredContent);
    expect(parsedOutput.success, parsedOutput.error?.message).toBe(true);
    expect(
      outputSchema.safeParse({
        ...result.structuredContent,
        page: {
          ...resultPage,
          actions: [{ ...action, ownerUserId: "private_user" }],
        },
      }).success,
    ).toBe(false);
  });

  it("summarizes a populated page and mentions continuation only when truthful", async () => {
    mocks.listActions.mockResolvedValue(page());

    const result = await growthGetActionsTool.handler(
      parseInput({ projectId, limit: 12 }),
      context,
    );
    const text = textContent(result);

    expect(text).toContain(action.title);
    expect(text).toContain(action.id);
    expect(text).toContain(action.status);
    expect(text).toContain(action.category);
    expect(text).toContain(String(action.priorityScore));
    expect(text).toContain(action.dueAt);
    expect(text).toContain("(sanitized)");
    expect(text).toContain("structuredContent.page.nextCursor");
    expect(text).toContain("growth_get_actions");
    expect(text).not.toContain(action.description);
    expect(text).not.toContain(action.displayTargets[0].value);
  });

  it("distinguishes empty and final pages without inventing a continuation", async () => {
    mocks.listActions.mockResolvedValueOnce(
      page({ actions: [], hasMore: false, nextCursor: null }),
    );
    const emptyResult = await growthGetActionsTool.handler(
      parseInput({ projectId }),
      context,
    );
    expect(textContent(emptyResult)).toMatch(/no saved Growth Actions match/i);
    expect(textContent(emptyResult)).not.toContain("nextCursor");

    mocks.listActions.mockResolvedValueOnce(
      page({ hasMore: false, nextCursor: null }),
    );
    const finalResult = await growthGetActionsTool.handler(
      parseInput({ projectId }),
      context,
    );
    expect(textContent(finalResult)).toMatch(/end of the current saved/i);
    expect(textContent(finalResult)).not.toContain("nextCursor");
  });
});
