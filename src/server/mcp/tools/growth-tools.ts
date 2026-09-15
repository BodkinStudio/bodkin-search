import { z } from "zod";
import { GrowthMonthlyReportsService } from "@/server/features/growth/services/GrowthMonthlyReportsService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  growthMonthlyReportDtoSchema,
  type GrowthMonthlyReportDto,
} from "@/types/schemas/growth-monthly-reports";

const inputSchema = {
  projectId: projectIdSchema,
} as const;

function textValue(value: string | number | boolean | null) {
  return value === null ? "Not available" : String(value);
}

function formatMonthlySummary(summary: GrowthMonthlyReportDto) {
  const period = `${summary.periodStart} to ${summary.periodEnd} (${summary.reportTimezone})`;
  if (summary.state === "ready") {
    return `Monthly summary for ${period}\n\nNo saved monthly summary is available for this completed month yet. Open Growth to build it when the saved activity is ready for review.`;
  }
  if (summary.state === "no_activity") {
    return `Monthly summary for ${period}\n\nNo monthly summary was created: ${summary.message}`;
  }

  const { report } = summary;
  const header = [
    `Monthly summary for ${period}`,
    `Status: ${report.status}`,
    `Version: ${report.version}`,
    `Generated: ${report.generatedAt}`,
    `Data cutoff: ${report.dataCutoffAt}`,
    ...(report.status === "published"
      ? [`Published: ${report.publishedAt}`]
      : []),
  ];
  const sections = report.sections.map((section) => {
    const items = section.items.flatMap((item) => [
      `- ${item.title}: ${item.summary}`,
      ...item.facts.map(
        (fact) => `  - ${fact.label}: ${textValue(fact.value)}`,
      ),
    ]);
    return [`## ${section.title}`, section.summary, ...items].join("\n");
  });
  return [...header, ...sections].join("\n\n");
}

/**
 * Current, read-only projection of the monthly Growth report. Building and
 * publishing remain explicit human actions in the Growth UI.
 */
export const growthGetMonthlySummaryTool = {
  name: "growth_get_monthly_summary",
  config: {
    title: "Get Growth monthly summary",
    description:
      "Reads the current previous-complete-month Growth summary for a project. Uses zero credits and never builds or publishes a report. Returns whether a summary is ready, has no eligible saved activity, or is a saved draft or published report with its bounded sections and facts.",
    inputSchema,
    outputSchema: z.strictObject({
      summary: growthMonthlyReportDtoSchema,
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof inputSchema>>, context) => {
      const summary = await GrowthMonthlyReportsService.getGrowthMonthlyReport(
        args.projectId,
      );
      return mcpResponse({
        text: formatMonthlySummary(summary),
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/growth/operations#growth-monthly-summary`,
        ),
        structuredContent: { summary },
      });
    },
  ),
};
