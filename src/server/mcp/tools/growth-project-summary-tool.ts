import { z } from "zod";
import { GrowthProjectSummaryService } from "@/server/features/growth/services/GrowthProjectSummaryService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  growthProjectSummaryDtoSchema,
  type GrowthProjectSummaryDto,
} from "@/types/schemas/growth-project-summary";

const inputSchema = { projectId: projectIdSchema } as const;
type Input = z.infer<z.ZodObject<typeof inputSchema>>;

function formatProjectSummary(summary: GrowthProjectSummaryDto) {
  const recommendations = summary.unresolvedRecommendations.items.map(
    (recommendation) =>
      `- ${recommendation.title.value} [${recommendation.id}] — ${recommendation.status}; priority ${recommendation.priorityScore}.`,
  );
  const actions = summary.currentActions.items.map(
    (action) =>
      `- ${action.title.value} [${action.id}] — ${action.status}; priority ${action.priorityScore}; due ${action.dueAt}.`,
  );
  const signals = summary.recentSignals.items.map(
    (signal) =>
      `- ${signal.severity}: ${signal.metric.value} (${signal.periodStart} to ${signal.periodEnd}; captured ${signal.capturedAt}).`,
  );
  const measurements =
    summary.dueMeasurements.scanState === "overflow"
      ? [
          "The active Measurement scan exceeded its safe bound, so no partial due list is shown.",
        ]
      : summary.dueMeasurements.items.map(
          (measurement) =>
            `- Action ${measurement.actionId}: available ${measurement.availableOn} (${measurement.reportTimezone}); lifecycle ${measurement.integrity}.`,
        );

  return [
    `Growth project summary: ${summary.project.name.value}`,
    `Assembled: ${summary.asOf} (current saved rows; not an atomic historical snapshot)`,
    `Growth: ${summary.settings.growthEnabled ? "enabled" : "disabled"}; report timezone ${summary.settings.reportTimezone}.`,
    `Project context: ${summary.context.missingSections.length === 0 ? "all four typed sections are present" : `missing ${summary.context.missingSections.join(", ")}`}.`,
    `Saved Growth Signal freshness: ${summary.freshness.latestSignalAt ?? "no saved terminal-run Signals"}. This is not live provider freshness.`,
    "",
    "Unresolved Recommendations:",
    ...(recommendations.length > 0
      ? recommendations
      : ["- No unresolved saved Recommendations in this bounded view."]),
    ...(summary.unresolvedRecommendations.hasMore
      ? ["- More unresolved Recommendations are available."]
      : []),
    "",
    "Current Actions:",
    ...(actions.length > 0
      ? actions
      : ["- No current saved Actions in this bounded view."]),
    ...(summary.currentActions.hasMore
      ? ["- More current Actions are available through growth_get_actions."]
      : []),
    "",
    "Due Measurement windows:",
    ...(measurements.length > 0
      ? measurements
      : ["- No due active Measurement window was found in the complete scan."]),
    ...(summary.dueMeasurements.hasMore &&
    summary.dueMeasurements.scanState === "complete"
      ? ["- More due Measurement windows are available."]
      : []),
    "",
    "Recent saved Signals:",
    ...(signals.length > 0
      ? signals
      : ["- No eligible terminal-run Signals were found."]),
    ...(summary.recentSignals.hasMore
      ? ["- More eligible Signals are available."]
      : []),
  ].join("\n");
}

/** Compact orientation over saved Growth records; never a provider refresh. */
export const growthGetProjectSummaryTool = {
  name: "growth_get_project_summary",
  config: {
    title: "Get Growth project summary",
    description:
      "Reads a compact current orientation from saved Growth records: project and core-context coverage, Growth settings, saved Signal freshness, unresolved Recommendations, current Actions, due Measurement windows, and recent Signals. Uses zero credits, makes no provider calls, and never creates or changes data. The result is a bounded current assembly, not an atomic historical snapshot or a claim about live GSC, GA4, rank, audit, or backlink freshness.",
    inputSchema,
    outputSchema: z.strictObject({
      summary: growthProjectSummaryDtoSchema,
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Input, context) => {
    const summary = await GrowthProjectSummaryService.getProjectSummary({
      id: context.project.id,
      name: context.project.name,
      domain: context.project.domain,
      locationCode: context.project.locationCode,
      languageCode: context.project.languageCode,
      createdAt: context.project.createdAt,
    });
    return mcpResponse({
      text: formatProjectSummary(summary),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/growth`,
      ),
      structuredContent: { summary },
    });
  }),
};
