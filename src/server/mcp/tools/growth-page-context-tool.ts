import { z } from "zod";
import { GrowthPageContextService } from "@/server/features/growth/services/GrowthPageContextService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  growthPageContextDtoSchema,
  type GrowthPageContextDto,
} from "@/types/schemas/growth-page-context";

const inputSchema = {
  projectId: projectIdSchema,
  url: z.string().trim().min(1).max(2048),
} as const;
type Input = z.infer<z.ZodObject<typeof inputSchema>>;
function format(context: GrowthPageContextDto) {
  const curation =
    context.curation.state === "curated"
      ? `curated${context.curation.protected ? " and protected" : ""}`
      : "not curated";
  const gsc = context.searchPerformance.state === "available";
  return [
    `Page context: ${curation}.`,
    `Search Console context: ${gsc ? "available" : context.searchPerformance.state}.`,
    `Bounded saved context: ${context.recommendations.items.length} Recommendations, ${context.actions.items.length} Actions, ${context.changes.items.length} Changes, ${context.measurements.items.length} active Measurements.`,
    "Use structured content for the full safe details; mutable saved rows are current, not an atomic historical snapshot.",
  ].join("\n");
}
/** Read-only page orientation over saved Growth records and final GSC facts. */
export const growthGetPageContextTool = {
  name: "growth_get_page_context",
  config: {
    title: "Get Growth page context",
    description:
      "Reads one authorised project page's current curation, bounded saved Growth context, saved rank context and final Search Console performance. It creates or changes nothing, uses no OpenSEO/DataForSEO credits, and is not an atomic historical snapshot.",
    inputSchema,
    outputSchema: z.strictObject({
      context: growthPageContextDtoSchema,
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Input, context) => {
    const page = await GrowthPageContextService.getPageContext(
      { id: context.project.id, domain: context.project.domain },
      args.url,
    );
    return mcpResponse({
      text: format(page),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/growth/operations`,
      ),
      structuredContent: { context: page },
    });
  }),
};
