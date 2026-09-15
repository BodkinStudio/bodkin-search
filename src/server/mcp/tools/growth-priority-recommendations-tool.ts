import { z } from "zod";
import { GrowthPriorityRecommendationsReadService } from "@/server/features/growth/services/GrowthPriorityRecommendationsReadService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  growthPriorityRecommendationsInputShape,
  growthPriorityRecommendationsPageDtoSchema,
  type GrowthPriorityRecommendationsPageDto,
} from "@/types/schemas/growth-priority-recommendations";

type Input = z.infer<
  z.ZodObject<typeof growthPriorityRecommendationsInputShape>
>;

function formatPage(page: GrowthPriorityRecommendationsPageDto) {
  if (!page.recommendations.length)
    return "No saved unresolved Growth Recommendations match these filters. This is a current-state read, not a snapshot, total, or new discovery.";
  return [
    `Saved unresolved Growth Recommendations (${page.recommendations.length} on this page; current state, not a snapshot, total, or new discovery):`,
    ...page.recommendations.map(
      (recommendation) =>
        `- ${recommendation.title} [${recommendation.id}] — ${recommendation.status}; category ${recommendation.category}; priority ${recommendation.priorityScore}; impact ${recommendation.impact}, commercial relevance ${recommendation.commercialRelevance}, effort ${recommendation.effort}, urgency ${recommendation.urgency}, confidence ${recommendation.confidence}; ${recommendation.targetCount} target${recommendation.targetCount === 1 ? "" : "s"}, ${recommendation.stepCount} step${recommendation.stepCount === 1 ? "" : "s"}.`,
    ),
    page.hasMore
      ? "Another page is available. Pass structuredContent.page.nextCursor unchanged as cursor to growth_get_priority_recommendations."
      : "This is the end of the current saved unresolved Recommendation list for these filters.",
    "Safe bounded targets and steps are in structuredContent.page.recommendations.",
  ].join("\n");
}

/** Current, privacy-safe saved Recommendation summaries; this never discovers or changes work. */
export const growthGetPriorityRecommendationsTool = {
  name: "growth_get_priority_recommendations",
  config: {
    title: "Get Priority Growth Recommendations",
    description:
      "Lists current saved unresolved Growth Recommendations for a project, ordered by priority, with optional unresolved-status, exact-category, minimum-priority, page-limit and continuation-cursor filters. This is a read-only, non-destructive saved-data read: it uses zero credits, makes no provider calls, discovers nothing new, and never creates or changes Recommendations or Actions.",
    inputSchema: growthPriorityRecommendationsInputShape,
    outputSchema: z.strictObject({
      page: growthPriorityRecommendationsPageDtoSchema,
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Input, context) => {
    const page =
      await GrowthPriorityRecommendationsReadService.listPriorityRecommendations(
        args,
      );
    return mcpResponse({
      text: formatPage(page),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/growth/operations`,
      ),
      structuredContent: { page },
    });
  }),
};
