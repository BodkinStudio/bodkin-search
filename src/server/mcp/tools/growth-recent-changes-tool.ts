import { z } from "zod";
import { GrowthRecentChangesReadService } from "@/server/features/growth/services/GrowthRecentChangesReadService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  growthRecentChangesInputShape,
  growthRecentChangesPageDtoSchema,
  type GrowthRecentChangesPageDto,
} from "@/types/schemas/growth-recent-changes";

type Input = z.infer<z.ZodObject<typeof growthRecentChangesInputShape>>;
function formatPage(page: GrowthRecentChangesPageDto) {
  if (!page.changes.length)
    return "No saved manual Change Event records are on this page. Any listed happenedAt is the supplied event timestamp, not an independently verified occurrence.";
  return [
    `Saved manual Change Event records (${page.changes.length} on this page; happenedAt is the supplied event timestamp, not an independently verified occurrence):`,
    ...page.changes.map(
      (change) =>
        `- ${change.changeType} [${change.id}] with supplied happenedAt ${change.happenedAt}; ${change.urlCount} URL${change.urlCount === 1 ? "" : "s"}.`,
    ),
    page.hasMore
      ? "Another page is available. Pass structuredContent.page.nextCursor unchanged as cursor to growth_get_recent_changes."
      : "This is the end of the current saved manual Change Event record list.",
    "Safe bounded URLs are in structuredContent.page.changes.",
  ].join("\n");
}
/** Saved manual website-change log only; never reads providers or writes data. */
export const growthGetRecentChangesTool = {
  name: "growth_get_recent_changes",
  config: {
    title: "Get Recent Manual Change Event Records",
    description:
      "Lists saved manual Change Event records for a project, ordered by supplied happenedAt timestamp newest first; happenedAt is not independently verified. This read-only, non-destructive saved-data-only tool uses zero credits, makes no provider calls, and performs no writes. It does not include Sherpa, deployment, CMS webhook, or other ingestion sources.",
    inputSchema: growthRecentChangesInputShape,
    outputSchema: z.strictObject({
      page: growthRecentChangesPageDtoSchema,
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Input, context) => {
    const page = await GrowthRecentChangesReadService.listRecentChanges(args);
    return mcpResponse({
      text: formatPage(page),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/growth#growth-change-log`,
      ),
      structuredContent: { page },
    });
  }),
};
