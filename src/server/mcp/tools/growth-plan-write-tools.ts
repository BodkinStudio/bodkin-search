import { z } from "zod";
import { GROWTH_PLAN_WRITE_SCOPE } from "@/lib/oauth-resource";
import { GrowthPlanService } from "@/server/features/growth/services/GrowthPlanService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpOperationScope } from "@/server/mcp/operation-auth";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  growthAddActionEvidenceRequestSchema,
  growthCreateActionRequestSchema,
  growthCreateWorkstreamRequestSchema,
  growthPlanActionDtoSchema,
  updateGrowthPlanNarrativeInputSchema,
  updateGrowthWorkstreamInputSchema,
  growthWorkstreamDtoSchema,
  type GrowthAddActionEvidenceRequest,
  type GrowthCreateActionRequest,
  type GrowthCreateWorkstreamRequest,
  type UpdateGrowthPlanNarrativeInput,
  type UpdateGrowthWorkstreamInput,
} from "@/types/schemas/growth-plan";

const PLAN_PURPOSE =
  "The Growth Plan is the project's top-down plan: ordered Workstreams that each say in plain language why the work matters commercially, each owning Actions with a rationale, a success measure, and tagged evidence.";
const EVIDENCE_KINDS =
  "Evidence kinds: measured (read from an account the project owns, such as Search Console or GA4), sampled (observed once on a named date, such as a live Google result), estimate (a third-party estimate such as provider search volume), judgement (the author's interpretation), reference (documentation or a public record).";
const SERIES_NOTE =
  "When a measured or sampled statement quotes numbers, carry them as evidence.series so the plan can chart them instead of leaving them buried in prose. kind monthly: one point per calendar month, label YYYY-MM, drawn as a line. kind bars: one point per category, label = the category, drawn as horizontal bars. kind matrix: label = the row (such as a search query), group = the column (such as a company), value = the cell (such as an organic position, null when absent). Give the series a title and the unit its values are in.";
const REQUEST_KEY_NOTE =
  "Reuse requestKey only to retry this exact fact; a reused key carrying a different fact conflicts.";

const workstreamOutputSchema = z.strictObject({
  workstream: growthWorkstreamDtoSchema,
  ...optionalMetaOutputSchema,
});
const actionOutputSchema = z.strictObject({
  action: growthPlanActionDtoSchema,
  ...optionalMetaOutputSchema,
});
const writeAnnotations = {
  readOnlyHint: false,
  idempotentHint: true,
  openWorldHint: false,
  destructiveHint: false,
} as const;

const planUrl = (context: { baseUrl: string }, projectId: string) =>
  buildProjectMeta(context, projectId, `/p/${projectId}/growth`);

// MCP writes are attributed to the agent acting for the token's user.
const mcpActor = (context: { auth: { userId: string } }) =>
  ({ actorType: "agent", actorId: context.auth.userId }) as const;

export const growthCreateWorkstreamTool = {
  name: "growth_create_workstream",
  config: {
    title: "Create Growth Workstream",
    description: `Appends one Workstream to the end of the project's Growth Plan. ${PLAN_PURPOSE} commercialReason is read by non-specialists, so write it without SEO jargon. ${REQUEST_KEY_NOTE} This writes saved OpenSEO state but uses zero credits and makes no provider calls.`,
    inputSchema: growthCreateWorkstreamRequestSchema,
    outputSchema: workstreamOutputSchema,
    annotations: writeAnnotations,
  },
  handler: withMcpOperationScope(
    GROWTH_PLAN_WRITE_SCOPE,
    withMcpProjectAuth(async (args: GrowthCreateWorkstreamRequest, context) => {
      const workstream = await GrowthPlanService.createWorkstream({
        ...args,
        ...mcpActor(context),
      });
      return mcpResponse({
        text: `Saved Growth Workstream "${workstream.title}" [${workstream.id}] at plan position ${workstream.position}. ${REQUEST_KEY_NOTE}`,
        meta: planUrl(context, args.projectId),
        structuredContent: { workstream },
      });
    }),
  ),
};

export const growthUpdateWorkstreamTool = {
  name: "growth_update_workstream",
  config: {
    title: "Update Growth Workstream",
    description: `Edits one saved Workstream in place: its title, its plain-language commercialReason, its status (active, done, dropped) and its target (label, baseline, value, due date). ${PLAN_PURPOSE} Omitted fields are left unchanged. This writes saved OpenSEO state but uses zero credits and makes no provider calls; it does not reorder the plan or change any Action.`,
    inputSchema: updateGrowthWorkstreamInputSchema,
    outputSchema: workstreamOutputSchema,
    annotations: writeAnnotations,
  },
  handler: withMcpOperationScope(
    GROWTH_PLAN_WRITE_SCOPE,
    withMcpProjectAuth(async (args: UpdateGrowthWorkstreamInput, context) => {
      const workstream = await GrowthPlanService.updateWorkstream({
        ...args,
        ...mcpActor(context),
      });
      return mcpResponse({
        text: `Updated Growth Workstream "${workstream.title}" [${workstream.id}] — ${workstream.status}, ${workstream.actions.length} action(s).`,
        meta: planUrl(context, args.projectId),
        structuredContent: { workstream },
      });
    }),
  ),
};

export const growthCreateActionTool = {
  name: "growth_create_action",
  config: {
    title: "Create Growth Plan Action",
    description: `Appends one Action to the end of a Workstream. ${PLAN_PURPOSE} rationale explains, to a reader who knows nothing about SEO, why this work is in the plan; successMeasure names the number it should move. ${EVIDENCE_KINDS} Tag every evidence item honestly — an estimate must not be presented as measured. ${SERIES_NOTE} The Action is saved as approved and is not started, implemented or measured by this call. ${REQUEST_KEY_NOTE} It writes saved OpenSEO state but uses zero credits and makes no provider calls.`,
    inputSchema: growthCreateActionRequestSchema,
    outputSchema: actionOutputSchema,
    annotations: writeAnnotations,
  },
  handler: withMcpOperationScope(
    GROWTH_PLAN_WRITE_SCOPE,
    withMcpProjectAuth(async (args: GrowthCreateActionRequest, context) => {
      const action = await GrowthPlanService.createPlanAction({
        ...args,
        ...mcpActor(context),
      });
      return mcpResponse({
        text: `Saved Growth Plan Action "${action.title}" [${action.id}] due ${action.dueOn} with ${action.evidence.length} evidence item(s). ${REQUEST_KEY_NOTE}`,
        meta: planUrl(context, args.projectId),
        structuredContent: { action },
      });
    }),
  ),
};

export const growthAddActionEvidenceTool = {
  name: "growth_add_action_evidence",
  config: {
    title: "Add Growth Action Evidence",
    description: `Appends one tagged evidence item to a saved Action. ${EVIDENCE_KINDS} Tag it honestly and put the numbers and dates in the statement itself, so a reader can judge how firmly the Action is grounded. ${SERIES_NOTE} ${REQUEST_KEY_NOTE} This writes saved OpenSEO state but uses zero credits and makes no provider calls; it does not change the Action's status.`,
    inputSchema: growthAddActionEvidenceRequestSchema,
    outputSchema: actionOutputSchema,
    annotations: writeAnnotations,
  },
  handler: withMcpOperationScope(
    GROWTH_PLAN_WRITE_SCOPE,
    withMcpProjectAuth(
      async (args: GrowthAddActionEvidenceRequest, context) => {
        const action = await GrowthPlanService.addActionEvidence({
          ...args,
          ...mcpActor(context),
        });
        return mcpResponse({
          text: `Growth Action "${action.title}" [${action.id}] now carries ${action.evidence.length} evidence item(s). ${REQUEST_KEY_NOTE}`,
          meta: planUrl(context, args.projectId),
          structuredContent: { action },
        });
      },
    ),
  ),
};

export const growthUpdatePlanNarrativeTool = {
  name: "growth_update_plan_narrative",
  config: {
    title: "Update Growth Plan Narrative",
    description: `Sets the two pieces of writing at the top of the Growth Plan. The thesis is the one-sentence case for the whole plan, the first thing a client reads: what this work is meant to achieve commercially. The lede is the two- to four-sentence explanation underneath it, saying where the business is now, what the plan changes, and how progress will be judged. ${PLAN_PURPOSE} Write both without SEO jargon. Both fields are required in the call: send the existing text to keep it, and send null to clear it. No requestKey: the write replaces the stored text, so repeating it is safe. It writes saved OpenSEO state but uses zero credits and makes no provider calls; it does not change any Workstream or Action.`,
    inputSchema: updateGrowthPlanNarrativeInputSchema,
    outputSchema: z.strictObject({
      narrative: z.strictObject({
        thesis: z.string().nullable(),
        lede: z.string().nullable(),
      }),
      ...optionalMetaOutputSchema,
    }),
    annotations: writeAnnotations,
  },
  handler: withMcpOperationScope(
    GROWTH_PLAN_WRITE_SCOPE,
    withMcpProjectAuth(
      async (args: UpdateGrowthPlanNarrativeInput, context) => {
        const narrative = await GrowthPlanService.updateNarrative({
          ...args,
          projectDomain: context.project.domain,
          updatedBy: "mcp",
        });
        return mcpResponse({
          text: [
            narrative.thesis
              ? `Plan thesis: ${narrative.thesis}`
              : "Plan thesis cleared.",
            narrative.lede
              ? `Plan lede: ${narrative.lede}`
              : "Plan lede cleared.",
          ].join("\n"),
          meta: planUrl(context, args.projectId),
          structuredContent: { narrative },
        });
      },
    ),
  ),
};
