import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { growthGetMeasurementsTool } from "./growth-measurements-tool";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  listMeasurements: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock(
  "@/server/features/growth/services/GrowthMeasurementsReadService",
  () => ({
    GrowthMeasurementsReadService: { listMeasurements: mocks.listMeasurements },
  }),
);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
  mocks.listMeasurements.mockResolvedValue({
    measurements: [],
    limit: 20,
    hasMore: false,
    nextCursor: null,
  });
});

describe("growth_get_measurements MCP tool", () => {
  it("authorizes before its zero-credit saved-data read", async () => {
    expect(growthGetMeasurementsTool.config.description).toMatch(
      /no provider calls/i,
    );
    expect(growthGetMeasurementsTool.config.description).toMatch(
      /collects no evidence/i,
    );
    const input = z
      .object(growthGetMeasurementsTool.config.inputSchema)
      .parse({ projectId: "project_1" });
    mocks.getProjectForOrganization.mockResolvedValue(null);
    await expect(
      growthGetMeasurementsTool.handler(input, makeToolContext()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listMeasurements).not.toHaveBeenCalled();
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
    const result = await growthGetMeasurementsTool.handler(
      input,
      makeToolContext({ baseUrl: "https://open-seo.test" }),
    );
    expect(mocks.listMeasurements).toHaveBeenCalledWith(input);
    expect(result.structuredContent).toMatchObject({
      meta: { url: "https://open-seo.test/p/project_1/growth#growth-work" },
    });
    expect(textContent(result)).toMatch(/saved current Measurement Plans/i);
  });
});
