import { z } from "zod";
import { GrowthPlanService } from "@/server/features/growth/services/GrowthPlanService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  growthGetPlanRequestShape,
  growthPlanDtoSchema,
  type GrowthPlanDto,
} from "@/types/schemas/growth-plan";

const inputSchema = growthGetPlanRequestShape;
type Input = z.infer<z.ZodObject<typeof inputSchema>>;

function formatGrowthPlan(plan: GrowthPlanDto) {
  if (plan.workstreams.length === 0) {
    return "This project has no Growth Plan Workstreams yet.";
  }

  const lines = plan.workstreams.map((workstream) => {
    const counts = new Map<string, number>();
    for (const action of workstream.actions)
      counts.set(action.status, (counts.get(action.status) ?? 0) + 1);
    const byStatus = [...counts]
      .map(([status, count]) => `${count} ${status}`)
      .join(", ");
    return `${workstream.position}. ${workstream.title} [${workstream.id}] — ${workstream.status}; ${workstream.actions.length} action${workstream.actions.length === 1 ? "" : "s"}${byStatus ? ` (${byStatus})` : ""}${workstream.targetLabel ? `; target: ${workstream.targetLabel}` : ""}`;
  });

  return [
    `Growth Plan (${plan.workstreams.length} workstream${plan.workstreams.length === 1 ? "" : "s"}):`,
    ...lines,
    "Each action's rationale, success measure and tagged evidence are in structuredContent.plan.",
  ].join("\n");
}

/** The whole saved plan: ordered Workstreams, their Actions, and the evidence behind each. */
export const growthGetPlanTool = {
  name: "growth_get_plan",
  config: {
    title: "Get Growth Plan",
    description:
      "Returns the project's Growth Plan: an ordered list of Workstreams, each stating in plain language why it matters commercially, each owning Actions that carry a rationale, a success measure and tagged evidence. Evidence kinds are measured (read from the project's own accounts), sampled (observed once on a date), estimate (a third-party estimate), judgement (the author's interpretation) and reference (documentation or a public record). Reads saved OpenSEO data only, uses zero credits, makes no provider calls, and never changes the plan.",
    inputSchema,
    outputSchema: z.strictObject({
      plan: growthPlanDtoSchema,
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Input, context) => {
    const plan = await GrowthPlanService.getPlan(args.projectId);
    return mcpResponse({
      text: formatGrowthPlan(plan),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/growth`,
      ),
      structuredContent: { plan },
    });
  }),
};
