import { z } from "zod";
import { LinkedInPageContentService } from "@/server/features/linkedin/services/LinkedInPageContentService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import type {
  LinkedInPageOverviewResult,
  LinkedInPostPerformanceResult,
} from "@/shared/linkedin";

const inputSchema = z.strictObject({ projectId: projectIdSchema });
type Args = z.infer<typeof inputSchema>;

const metricSchema = z.number().nonnegative().nullable();
const metricTotalsSchema = z.strictObject({
  impressions: metricSchema,
  membersReached: metricSchema,
  videoViews: metricSchema,
  clicks: metricSchema,
  reactions: metricSchema,
  comments: metricSchema,
  reposts: metricSchema,
  follows: metricSchema,
});
const comparisonSchema = z.strictObject({
  impressions: z.number().nullable(),
  membersReached: z.number().nullable(),
  videoViews: z.number().nullable(),
  clicks: z.number().nullable(),
  reactions: z.number().nullable(),
  comments: z.number().nullable(),
  reposts: z.number().nullable(),
  follows: z.number().nullable(),
});
const sourceSchema = z.strictObject({
  provider: z.literal("linkedin_page_content_manual"),
  pageName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  importedAt: z.string(),
  rowCount: z.number().int().nonnegative(),
});
const warningSchema = z.enum([
  "partial_current_metric_values",
  "partial_previous_metric_values",
  "no_exact_adjacent_prior_import",
]);
const metaSchema = z.strictObject({
  projectId: z.string(),
  url: z.string().url(),
});
const errorSchema = z.strictObject({
  status: z.literal("error"),
  projectId: z.string(),
  error: z.strictObject({
    code: z.literal("linkedin_no_import"),
    message: z.string(),
    actionUrl: z.string().url(),
  }),
  meta: metaSchema,
});
const overviewFields = {
  status: z.literal("ok"),
  projectId: z.string(),
  source: sourceSchema,
  current: metricTotalsSchema,
  previous: metricTotalsSchema.nullable(),
  comparison: comparisonSchema.nullable(),
  completeness: z.enum(["complete", "partial"]),
  warnings: z.array(warningSchema),
  meta: metaSchema,
} as const;
const overviewOutputSchema = z.discriminatedUnion("status", [
  z.strictObject(overviewFields),
  errorSchema,
]);
const postSchema = z.strictObject({
  postUrl: z.string().url().nullable(),
  postText: z.string().nullable(),
  publishedAt: z.string().nullable(),
  impressions: metricSchema,
  membersReached: metricSchema,
  videoViews: metricSchema,
  clicks: metricSchema,
  reactions: metricSchema,
  comments: metricSchema,
  reposts: metricSchema,
  follows: metricSchema,
  providerClickThroughRate: z.number().min(0).max(100).nullable(),
  providerEngagementRate: z.number().min(0).max(100).nullable(),
});
const postOutputSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...overviewFields,
    posts: z.array(postSchema).max(10),
  }),
  errorSchema,
]);

function actionPath(projectId: string): string {
  return `/p/${projectId}/dashboard#linkedin-page-content`;
}

function response(
  args: Args,
  context: { baseUrl: string },
  result: LinkedInPageOverviewResult | LinkedInPostPerformanceResult,
) {
  const meta = buildProjectMeta(
    context,
    args.projectId,
    actionPath(args.projectId),
  );
  const normalized =
    result.status === "error"
      ? {
          ...result,
          error: {
            ...result.error,
            actionUrl: buildDashboardUrl(
              context.baseUrl,
              result.error.actionUrl,
            ),
          },
        }
      : result;
  const structuredContent = { ...normalized, meta };
  return mcpResponse({
    text: JSON.stringify(structuredContent),
    meta,
    structuredContent,
  });
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
  destructiveHint: false,
} as const;

export const getLinkedInPageOverviewTool = {
  name: "get_linkedin_page_overview",
  config: {
    title: "Get LinkedIn Page overview",
    description:
      "Read totals and an exact adjacent-period comparison from the latest manually imported LinkedIn Page Content report. Read-only and uses no OpenSEO credits.",
    inputSchema,
    outputSchema: overviewOutputSchema,
    annotations: readOnlyAnnotations,
  },
  handler: withMcpProjectAuth(async (args: Args, context) =>
    response(args, context, await LinkedInPageContentService.overview(args)),
  ),
};

export const getLinkedInPostPerformanceTool = {
  name: "get_linkedin_post_performance",
  config: {
    title: "Get LinkedIn post performance",
    description:
      "Read up to 10 posts ordered by reported impressions from the latest manually imported LinkedIn Page Content report. Read-only and uses no OpenSEO credits.",
    inputSchema,
    outputSchema: postOutputSchema,
    annotations: readOnlyAnnotations,
  },
  handler: withMcpProjectAuth(async (args: Args, context) =>
    response(args, context, await LinkedInPageContentService.topPosts(args)),
  ),
};
