import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { YouTubeChannelOverviewService } from "@/server/features/youtube/services/YouTubeChannelOverviewService";
import { YouTubeReportError } from "@/server/lib/youtubeErrors";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { looseObjectOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import type { YouTubeChannelOverview } from "@/shared/youtube";

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

function overviewText(result: YouTubeChannelOverview) {
  // This remains bounded: the service returns one aggregate, one comparison,
  // and no more than 90 daily trend rows.
  return `YouTube Analytics overview: ${JSON.stringify(result)}`;
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
      const meta = buildProjectMeta(context, args.projectId);
      const structuredContent = {
        ...result,
        meta: { projectId: args.projectId },
      };
      return mcpResponse({
        text: overviewText(structuredContent),
        meta,
        structuredContent,
      });
    } catch (error) {
      return errorResponse(args, context, error);
    }
  }),
};
