import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { YouTubeChannelOverviewService } from "@/server/features/youtube/services/YouTubeChannelOverviewService";
import { YouTubeContentAnalyticsService } from "@/server/features/youtube/services/YouTubeContentAnalyticsService";
import { YouTubeReportError } from "@/server/lib/youtubeErrors";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { looseObjectOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import type {
  YouTubeChannelOverview,
  YouTubeTrafficSources,
  YouTubeVideoPerformance,
} from "@/shared/youtube";

const inputSchema = z.strictObject({
  projectId: projectIdSchema,
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
type Args = z.infer<typeof inputSchema>;

type SuccessfulReport =
  | YouTubeChannelOverview
  | YouTubeVideoPerformance
  | YouTubeTrafficSources;

function successResponse(
  args: Args,
  context: { baseUrl: string },
  label: string,
  result: SuccessfulReport,
) {
  const meta = buildProjectMeta(context, args.projectId);
  const structuredContent = {
    ...result,
    meta: { projectId: args.projectId },
  };
  return mcpResponse({
    text: `${label}: ${JSON.stringify(structuredContent)}`,
    meta,
    structuredContent,
  });
}

const outputSchema = z
  .object({
    status: z.enum(["ok", "error"]),
    source: looseObjectOutputSchema.optional(),
    request: looseObjectOutputSchema.optional(),
    current: looseObjectOutputSchema.optional(),
    previous: looseObjectOutputSchema.optional(),
    comparison: looseObjectOutputSchema.optional(),
    trend: z.array(z.record(z.string(), z.unknown())).optional(),
    observedThrough: z.string().nullable().optional(),
    completeness: z.enum(["complete", "partial", "unknown"]).optional(),
    retrievedAt: z.string().optional(),
    warnings: z.array(z.string()).optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        retryAfterSeconds: z.number().nullable().optional(),
        actionUrl: z.string().optional(),
      })
      .optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (value.status === "error") {
      if (!value.error)
        context.addIssue({
          code: "custom",
          path: ["error"],
          message: "error is required when status is error",
        });
      return;
    }
    for (const field of [
      "source",
      "request",
      "current",
      "previous",
      "comparison",
      "trend",
      "observedThrough",
      "completeness",
      "retrievedAt",
      "warnings",
    ] as const) {
      if (value[field] === undefined)
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} is required when status is ok`,
        });
    }
  });

function contentOutputSchema(field: "videos" | "sources", maximum: number) {
  return z
    .object({
      status: z.enum(["ok", "error"]),
      source: looseObjectOutputSchema.optional(),
      request: looseObjectOutputSchema.optional(),
      videos: z
        .array(z.record(z.string(), z.unknown()))
        .max(field === "videos" ? maximum : 0)
        .optional(),
      sources: z
        .array(z.record(z.string(), z.unknown()))
        .max(field === "sources" ? maximum : 0)
        .optional(),
      observedThrough: z.string().nullable().optional(),
      completeness: z.enum(["complete", "partial", "unknown"]).optional(),
      retrievedAt: z.string().optional(),
      warnings: z.array(z.string()).optional(),
      error: z
        .object({
          code: z.string(),
          message: z.string(),
          retryAfterSeconds: z.number().nullable().optional(),
          actionUrl: z.string().optional(),
        })
        .optional(),
    })
    .passthrough()
    .superRefine((value, context) => {
      if (value.status === "error") {
        if (!value.error)
          context.addIssue({
            code: "custom",
            path: ["error"],
            message: "error is required when status is error",
          });
        return;
      }
      for (const required of [
        "source",
        "request",
        field,
        "observedThrough",
        "completeness",
        "retrievedAt",
        "warnings",
      ] as const) {
        if (value[required] === undefined)
          context.addIssue({
            code: "custom",
            path: [required],
            message: `${required} is required when status is ok`,
          });
      }
    });
}

const videoOutputSchema = contentOutputSchema("videos", 10);
const trafficOutputSchema = contentOutputSchema("sources", 25);

function errorResponse(
  args: Args,
  context: {
    auth: { organizationId: string };
    baseUrl: string;
    project: unknown;
  },
  error: unknown,
): CallToolResult {
  if (!(error instanceof YouTubeReportError)) throw error;
  const actionUrl = [
    "youtube_not_connected",
    "youtube_reconnect_required",
    "youtube_channel_inaccessible",
  ].includes(error.code)
    ? buildDashboardUrl(
        context.baseUrl,
        `/p/${args.projectId}/settings/integrations#youtube`,
      )
    : undefined;
  return mcpResponse({
    text: `${error.message}${actionUrl ? ` Continue here: ${actionUrl}` : ""}`,
    meta: buildProjectMeta(context, args.projectId),
    structuredContent: {
      status: "error",
      error: {
        code: error.code,
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds,
        actionUrl,
      },
    },
  });
}

export const getYouTubeChannelOverviewTool = {
  name: "get_youtube_channel_overview",
  config: {
    title: "Get YouTube channel overview",
    description:
      "Read a connected YouTube channel's views, watch time, engagement, subscriber change, equal-length previous-period comparison, and daily views trend. Read-only and uses no OpenSEO credits.",
    inputSchema,
    outputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    try {
      const result = await YouTubeChannelOverviewService.getOverview(args);
      return successResponse(
        args,
        context,
        "YouTube Analytics overview",
        result,
      );
    } catch (error) {
      return errorResponse(args, context, error);
    }
  }),
};

export const getYouTubeVideoPerformanceTool = {
  name: "get_youtube_video_performance",
  config: {
    title: "Get YouTube video performance",
    description:
      "Read up to 10 top videos for a connected YouTube channel, ordered by watch time with engagement, metadata, and equal-length previous-period context. Read-only and uses no OpenSEO credits.",
    inputSchema,
    outputSchema: videoOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    try {
      const result =
        await YouTubeContentAnalyticsService.getVideoPerformance(args);
      return successResponse(
        args,
        context,
        "YouTube video performance",
        result,
      );
    } catch (error) {
      return errorResponse(args, context, error);
    }
  }),
};

export const getYouTubeTrafficSourcesTool = {
  name: "get_youtube_traffic_sources",
  config: {
    title: "Get YouTube traffic sources",
    description:
      "Read up to 25 traffic-source types for a connected YouTube channel with reported views, watch time, source-row share, and equal-length previous-period context. Read-only and uses no OpenSEO credits.",
    inputSchema,
    outputSchema: trafficOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    try {
      const result =
        await YouTubeContentAnalyticsService.getTrafficSources(args);
      return successResponse(args, context, "YouTube traffic sources", result);
    } catch (error) {
      return errorResponse(args, context, error);
    }
  }),
};
