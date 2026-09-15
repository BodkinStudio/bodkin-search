import { z } from "zod";
import { GrowthActionsReadService } from "@/server/features/growth/services/GrowthActionsReadService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  growthActionsReadInputShape,
  growthActionsReadPageDtoSchema,
  type GrowthActionsReadPageDto,
} from "@/types/schemas/growth-action-reads";

const inputSchema = growthActionsReadInputShape;
type Input = z.infer<z.ZodObject<typeof inputSchema>>;

function projectionNote(redacted: boolean, truncated: boolean) {
  if (!redacted && !truncated) return "";
  return ` (${[redacted ? "sanitized" : null, truncated ? "truncated" : null]
    .filter(Boolean)
    .join(", ")})`;
}

function formatActionsPage(page: GrowthActionsReadPageDto) {
  if (page.actions.length === 0) {
    return "No saved Growth Actions match these filters.";
  }

  const actions = page.actions.map(
    (action) =>
      `- ${action.title}${projectionNote(action.titleRedacted, action.titleTruncated)} [${action.id}] — ${action.status}; category ${action.category}${projectionNote(action.categoryRedacted, action.categoryTruncated)}; priority ${action.priorityScore}; due ${action.dueAt}; ${action.targetCount} target${action.targetCount === 1 ? "" : "s"}.`,
  );
  const continuation = page.hasMore
    ? "Another page is available. Pass structuredContent.page.nextCursor unchanged as cursor to growth_get_actions."
    : "This is the end of the current saved Action list for these filters.";

  return [
    `Saved Growth Actions (${page.actions.length} on this page):`,
    ...actions,
    continuation,
    "Descriptions and bounded display targets are in structuredContent.page.actions.",
  ].join("\n");
}

/** Current, privacy-safe Action summaries backed only by saved Growth data. */
export const growthGetActionsTool = {
  name: "growth_get_actions",
  config: {
    title: "Get Growth Actions",
    description:
      "Lists current saved Growth Actions for a project, newest first, with optional status, exact category, minimum-priority, page-limit, and continuation-cursor filters. Reads saved OpenSEO data only, uses zero credits, makes no provider calls, and never creates or changes Actions. Results are sanitized and bounded to 50 Actions; use the returned nextCursor unchanged only when hasMore is true.",
    inputSchema,
    outputSchema: z.strictObject({
      page: growthActionsReadPageDtoSchema,
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Input, context) => {
    const page = await GrowthActionsReadService.listActions(args);
    return mcpResponse({
      text: formatActionsPage(page),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/growth/operations#growth-work`,
      ),
      structuredContent: { page },
    });
  }),
};
