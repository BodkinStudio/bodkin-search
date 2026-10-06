import {
  canAdministerAnalytics,
  requireAnalyticsAdmin,
} from "@/server/features/analytics/AnalyticsAccess";
import { overviewReport } from "@/server/features/analytics/AnalyticsOverviewReport";
import { acquisitionDimensions } from "@/server/features/analytics/AnalyticsAcquisition";
import { z } from "zod";
import { AnalyticsService } from "@/server/features/analytics/AnalyticsService";
import { analyticsQuerySchema } from "@/types/schemas/analytics";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
const inputSchema = analyticsQuerySchema.extend({
  view: z.enum([
    "overview",
    "acquisition",
    "funnels",
    "journeys",
    "customers",
    "health",
    "mqls",
    "traffic",
    "ads",
  ]),
});
type Input = z.infer<typeof inputSchema>;
export const analyticsQueryTool = {
  name: "analytics_query",
  config: {
    title: "Inspect journey analytics",
    description:
      "Read saved project analytics only: overview, source/landing acquisition, ordered funnel cohort, permitted journeys/customers, tracking health, or qualified leads (mqls: MQLs per calendar week against the weekly target, split enquiry/demo vs trial, by first-touch channel, source and campaign; individual leads with their first touch for administrators where personal inspection is on), or traffic (visitors by first-touch channel and by ad campaign and keyword: landing pages, pages per visitor, start-trial/book-demo/contact clicks, qualified leads, Google Ads spend), or ads (the Google Ads learning read: search terms people typed before clicking a Search ad, each judged promising, spending with no result, or too early against what its keyword's visitors did on the site; and Google's Best/Good/Low/Learning rating of each headline and description). Zero paid research calls. Counts are observed permitted contexts, never a census of humans. Exact and inferred acquisition are separate. Date boundaries are ISO instants with timezone-aware reporting; production and test are isolated. Personal reads require administrator permission and the project's individual-inspection setting. Returns observation window, metric definitions and internal evidence links; never returns IPs, network hashes or secrets.",
    inputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    outputSchema: z.object({
      data: z.unknown(),
      window: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        environment: z.string(),
      }),
      definitions: z.string(),
      evidenceUrl: z.string(),
      meta: z.unknown().optional(),
    }),
  },
  handler: withMcpProjectAuth(async (args: Input, context) => {
    let data: unknown;
    switch (args.view) {
      case "overview":
        data = await overviewReport(args);
        break;
      case "acquisition":
        data = await acquisitionDimensions(args);
        break;
      case "funnels": {
        const report = await AnalyticsService.funnels(args);
        if (
          !(await canAdministerAnalytics(
            context.auth.userId,
            context.auth.organizationId,
          ))
        )
          report.cohorts = [];
        data = report;
        break;
      }
      case "journeys":
        await requireAnalyticsAdmin(
          context.auth.userId,
          context.auth.organizationId,
        );
        data = await AnalyticsService.journeys(args);
        break;
      case "customers":
        await requireAnalyticsAdmin(
          context.auth.userId,
          context.auth.organizationId,
        );
        data = await AnalyticsService.customers(args);
        break;
      case "health":
        data = await AnalyticsService.health(args.projectId);
        break;
      case "traffic":
        data = await AnalyticsService.traffic(args);
        break;
      case "ads":
        data = await AnalyticsService.adsInsights(args);
        break;
      case "mqls": {
        const report = await AnalyticsService.mqls(args);
        if (
          !(await canAdministerAnalytics(
            context.auth.userId,
            context.auth.organizationId,
          ))
        )
          report.leads = null;
        data = report;
        break;
      }
    }
    return mcpResponse({
      text: `Saved ${args.view} analytics for ${args.environment}. Inspect structured data and the evidence link.`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/analytics`,
      ),
      structuredContent: {
        data,
        window: { from: args.from, to: args.to, environment: args.environment },
        definitions:
          "Visitors are permitted contexts. Outcomes are verified; acquisition method is exact, inferred or unattributed. Missing coverage is not zero conversion.",
        evidenceUrl: `/p/${args.projectId}/analytics?view=${args.view}&environment=${args.environment}`,
      },
    });
  }),
};
