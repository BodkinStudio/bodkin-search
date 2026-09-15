import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GROWTH_CHANGE_CREATE_SCOPE } from "@/lib/oauth-resource";
import { growthRecordChangeTool } from "./growth-record-change-tool";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  recordChange: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/growth/services/GrowthRecordChangeService", () => ({
  GrowthRecordChangeService: { recordChange: mocks.recordChange },
}));

const projectId = "project_1";
const input = {
  projectId,
  requestKey: "11111111-1111-4111-8111-111111111111",
  changeType: "content_updated" as const,
  description: "Updated pricing copy.",
  happenedAt: "2026-01-15T09:30:00.000Z",
  urls: ["https://example.com/pricing"],
};
const change = {
  id: "event_1",
  source: "manual" as const,
  changeType: "content_updated" as const,
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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: projectId });
  mocks.recordChange.mockResolvedValue(change);
});

describe("growth_record_change MCP tool", () => {
  it("advertises the bounded append-only write contract", () => {
    expect(growthRecordChangeTool.config.annotations).toEqual({
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: false,
      destructiveHint: false,
    });
    expect(growthRecordChangeTool.config.description).toMatch(/zero credits/i);
    expect(growthRecordChangeTool.config.description).toMatch(/no providers/i);
    expect(growthRecordChangeTool.config.description).toMatch(
      /caller supplied/i,
    );
    expect(growthRecordChangeTool.config.description).toMatch(/does not link/i);
    expect(
      Object.keys(growthRecordChangeTool.config.inputSchema.shape),
    ).toEqual([
      "projectId",
      "requestKey",
      "changeType",
      "description",
      "happenedAt",
      "urls",
    ]);
  });

  it("checks operation scope before project access and project access before writing", async () => {
    const parsed = z
      .strictObject(growthRecordChangeTool.config.inputSchema.shape)
      .parse(input);

    expect(() =>
      growthRecordChangeTool.handler(parsed, makeToolContext()),
    ).toThrow("FORBIDDEN");
    expect(mocks.getProjectForOrganization).not.toHaveBeenCalled();
    expect(mocks.recordChange).not.toHaveBeenCalled();

    const capable = makeToolContext({
      scopes: ["mcp", GROWTH_CHANGE_CREATE_SCOPE],
    });
    mocks.getProjectForOrganization.mockResolvedValueOnce(null);
    await expect(
      growthRecordChangeTool.handler(parsed, capable),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.recordChange).not.toHaveBeenCalled();

    mocks.getProjectForOrganization.mockResolvedValue({ id: projectId });
    const result = await growthRecordChangeTool.handler(parsed, capable);
    expect(mocks.recordChange).toHaveBeenCalledWith(
      parsed,
      expect.objectContaining({
        userId: capable.auth.userId,
        clientId: capable.auth.clientId,
        scopes: capable.auth.scopes,
      }),
    );
    expect(result.structuredContent).toMatchObject({
      change,
      meta: {
        projectId,
        url: "https://open-seo.test/p/project_1/growth/operations#growth-change-log",
      },
    });
    expect(textContent(result)).toMatch(/recorded or replayed/i);
    expect(textContent(result)).toMatch(/caller-supplied happenedAt/i);
    expect(textContent(result)).toMatch(/does not link an Action/i);
  });
});
