import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ToolAuthContext } from "@/server/mcp/context";
import { YouTubeReportError } from "@/server/lib/youtubeErrors";
import { buildSamMcpTools } from "./samChatTools";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getOverview: vi.fn(),
  getVideoPerformance: vi.fn(),
  getTrafficSources: vi.fn(),
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
    (_name: string, _schema: unknown, handler: (...args: never[]) => unknown) =>
    (...args: never[]) =>
      handler(...args),
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock(
  "@/server/features/youtube/services/YouTubeChannelOverviewService",
  () => ({
    YouTubeChannelOverviewService: { getOverview: mocks.getOverview },
  }),
);
vi.mock(
  "@/server/features/youtube/services/YouTubeContentAnalyticsService",
  () => ({
    YouTubeContentAnalyticsService: {
      getVideoPerformance: mocks.getVideoPerformance,
      getTrafficSources: mocks.getTrafficSources,
    },
  }),
);

const context: ToolAuthContext = {
  userId: "user_1",
  userEmail: "agent@example.com",
  organizationId: "org_1",
  clientId: null,
  scopes: ["mcp"],
  baseUrl: "https://open-seo.test",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProjectForOrganization.mockResolvedValue({ id: "bound_project" });
});

const cases = [
  { name: "get_youtube_channel_overview", service: mocks.getOverview },
  { name: "get_youtube_video_performance", service: mocks.getVideoPerformance },
  { name: "get_youtube_traffic_sources", service: mocks.getTrafficSources },
];

function boundTool(name: string) {
  const tool = buildSamMcpTools(context, {
    id: "bound_project",
    domain: "example.com",
  })[name];
  if (!(tool.inputSchema instanceof z.ZodObject) || !tool.execute)
    throw new Error("Expected executable bound YouTube tool");
  return { schema: tool.inputSchema, execute: tool.execute };
}

const options = { toolCallId: "youtube", messages: [] };

describe("SAM YouTube tools", () => {
  it.each(cases)(
    "$name binds the project and preserves report evidence",
    async ({ name, service }) => {
      const report = {
        status: "ok",
        source: { provider: "youtube_analytics", channelId: "UC1" },
        observedThrough: "2026-09-04",
        completeness: "partial",
        retrievedAt: "2026-09-07T00:00:00Z",
        warnings: ["partial_daily_trend"],
      };
      service.mockResolvedValue(report);
      const tool = boundTool(name);
      expect(Object.keys(tool.schema.shape)).toEqual(["startDate", "endDate"]);
      const dates = { startDate: "2026-08-01", endDate: "2026-08-28" };
      expect(tool.schema.safeParse({ startDate: "yesterday" }).success).toBe(
        false,
      );
      const result: unknown = await tool.execute(
        { ...tool.schema.parse(dates), projectId: "other_project" },
        options,
      );
      expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
        "org_1",
        "bound_project",
      );
      expect(service).toHaveBeenCalledWith({
        ...dates,
        projectId: "bound_project",
      });
      expect(result).toMatchObject({
        data: { ...report, meta: { projectId: "bound_project" } },
      });
    },
  );

  it.each(cases)(
    "$name blocks reports when project access is denied",
    async ({ name, service }) => {
      mocks.getProjectForOrganization.mockResolvedValue(null);
      expect(await boundTool(name).execute({}, options)).toHaveProperty(
        "error",
      );
      expect(service).not.toHaveBeenCalled();
    },
  );

  it.each(cases)(
    "$name preserves actionable reconnect errors",
    async ({ name, service }) => {
      service.mockRejectedValue(
        new YouTubeReportError(
          "youtube_reconnect_required",
          "Reconnect YouTube.",
        ),
      );
      expect(await boundTool(name).execute({}, options)).toMatchObject({
        data: {
          status: "error",
          error: {
            code: "youtube_reconnect_required",
            actionUrl:
              "https://open-seo.test/p/bound_project/settings/integrations#youtube",
          },
        },
      });
    },
  );
});
