import { z } from "zod";
import { GrowthMeasurementsReadService } from "@/server/features/growth/services/GrowthMeasurementsReadService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  growthMeasurementsInputShape,
  growthMeasurementsPageDtoSchema,
  type GrowthMeasurementsPageDto,
} from "@/types/schemas/growth-measurements-list";

type Input = z.infer<z.ZodObject<typeof growthMeasurementsInputShape>>;
function formatPage(page: GrowthMeasurementsPageDto) {
  if (!page.measurements.length)
    return "No saved current Measurement Plans match these filters. This read does not collect evidence or calculate results.";
  return [
    `Saved current Measurement Plans (${page.measurements.length} on this page; recorded Results do not establish causality):`,
    ...page.measurements.map(
      (measurement) =>
        `- ${measurement.actionTitle} [${measurement.id}] — Plan ${measurement.status}; Action ${measurement.actionStatus} (${measurement.actionLifecycle}); ${measurement.metricCount} metric${measurement.metricCount === 1 ? "" : "s"}${measurement.result ? `; recorded outcome ${measurement.result.outcome}` : ""}.`,
    ),
    page.hasMore
      ? "Another page is available. Pass structuredContent.page.nextCursor unchanged as cursor to growth_get_measurements."
      : "This is the end of the current saved Measurement Plan list for these filters.",
    "Use growth_get_action for deeper saved Action and Measurement inspection.",
  ].join("\n");
}

/** Saved current Measurement Plans only; never collects evidence, calls providers, or writes data. */
export const growthGetMeasurementsTool = {
  name: "growth_get_measurements",
  config: {
    title: "Get Saved Growth Measurements",
    description:
      "Lists current saved Growth Measurement Plans and privacy-safe recorded Result summaries for a project. This read-only, non-destructive saved-data-only tool uses zero credits, makes no provider calls, collects no evidence, and performs no writes. Recorded Results do not establish causality.",
    inputSchema: growthMeasurementsInputShape,
    outputSchema: z.strictObject({
      page: growthMeasurementsPageDtoSchema,
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Input, context) => {
    const page = await GrowthMeasurementsReadService.listMeasurements(args);
    return mcpResponse({
      text: formatPage(page),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/growth/operations#growth-work`,
      ),
      structuredContent: { page },
    });
  }),
};
