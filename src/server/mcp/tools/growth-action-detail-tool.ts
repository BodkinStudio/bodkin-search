import { z } from "zod";
import { GrowthActionDetailService } from "@/server/features/growth/services/GrowthActionDetailService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  growthActionDetailDtoSchema,
  growthActionDetailInputShape,
} from "@/types/schemas/growth-action-detail";

const inputSchema = growthActionDetailInputShape;
type Input = z.infer<z.ZodObject<typeof inputSchema>>;
function format(detail: z.output<typeof growthActionDetailDtoSchema>) {
  return `Growth Action ${detail.action.title.value} [${detail.action.id}] is currently ${detail.action.status}. Structured content contains its bounded saved lifecycle, source evidence, linked Changes, and ${detail.measurement === "none" ? "no linked Measurement" : "validated Measurement"}. This is a current saved-data view, not a historical snapshot; Changes and Measurement context do not establish causality.`;
}
/** One bounded, saved-data-only Action chain for an already authorized project. */
export const growthGetActionTool = {
  name: "growth_get_action",
  config: {
    title: "Get Growth Action",
    description:
      "Gets one current saved Growth Action and its bounded lifecycle, source Recommendation evidence, linked Change Events, and optional validated Measurement. Reads saved OpenSEO data only, uses zero credits, makes no provider calls, and never changes data. The result is current-not-snapshot and Change/Measurement context is not causal proof.",
    inputSchema,
    outputSchema: z.strictObject({
      action: growthActionDetailDtoSchema,
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Input, context) => {
    const action = await GrowthActionDetailService.getAction(args);
    return mcpResponse({
      text: format(action),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/growth#growth-work`,
      ),
      structuredContent: { action },
    });
  }),
};
