import { createServerFn } from "@tanstack/react-start";
import { GrowthPlanEvidenceService } from "@/server/features/growth/services/GrowthPlanEvidenceService";
import { GrowthPlanService } from "@/server/features/growth/services/GrowthPlanService";
import { transitionGrowthActionSchema } from "@/types/schemas/growth-actions";
import {
  addGrowthActionEvidenceInputSchema,
  createGrowthPlanActionInputSchema,
  createGrowthWorkstreamInputSchema,
  deleteGrowthWorkstreamInputSchema,
  getGrowthPlanEvidenceInputSchema,
  getGrowthPlanInputSchema,
  removeGrowthActionEvidenceInputSchema,
  reorderGrowthWorkstreamsInputSchema,
  transitionGrowthPlanActionInputSchema,
  updateGrowthPlanActionInputSchema,
  updateGrowthPlanNarrativeInputSchema,
  updateGrowthWorkstreamInputSchema,
} from "@/types/schemas/growth-plan";
import { requireProjectContext } from "./middleware";

// The plan is always read and written for the project the request context is
// already scoped to; the validated projectId is replaced by it rather than
// trusted, exactly as the other growth server functions do.
const userActor = (userId: string) =>
  ({ actorType: "user", actorId: userId }) as const;

export const getGrowthPlan = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthPlanInputSchema)
  .handler(({ context }) => GrowthPlanService.getPlan(context.projectId));

export const updateGrowthPlanNarrative = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateGrowthPlanNarrativeInputSchema)
  .handler(({ data, context }) =>
    GrowthPlanService.updateNarrative({
      ...data,
      projectId: context.projectId,
      projectDomain: context.project.domain,
      updatedBy: "user",
    }),
  );

export const getGrowthPlanEvidence = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthPlanEvidenceInputSchema)
  .handler(({ context }) =>
    GrowthPlanEvidenceService.getPlanEvidence({ projectId: context.projectId }),
  );

export const createGrowthWorkstream = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createGrowthWorkstreamInputSchema)
  .handler(({ data, context }) =>
    GrowthPlanService.createWorkstream({
      ...data,
      projectId: context.projectId,
      ...userActor(context.userId),
    }),
  );

export const updateGrowthWorkstream = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateGrowthWorkstreamInputSchema)
  .handler(({ data, context }) =>
    GrowthPlanService.updateWorkstream({
      ...data,
      projectId: context.projectId,
      ...userActor(context.userId),
    }),
  );

export const reorderGrowthWorkstreams = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(reorderGrowthWorkstreamsInputSchema)
  .handler(({ data, context }) =>
    GrowthPlanService.reorderWorkstreams({
      ...data,
      projectId: context.projectId,
      ...userActor(context.userId),
    }),
  );

export const deleteGrowthWorkstream = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(deleteGrowthWorkstreamInputSchema)
  .handler(({ data, context }) =>
    GrowthPlanService.deleteWorkstream({
      ...data,
      projectId: context.projectId,
    }),
  );

export const createGrowthPlanAction = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createGrowthPlanActionInputSchema)
  .handler(({ data, context }) =>
    GrowthPlanService.createPlanAction({
      ...data,
      projectId: context.projectId,
      ...userActor(context.userId),
    }),
  );

export const updateGrowthPlanAction = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateGrowthPlanActionInputSchema)
  .handler(({ data, context }) =>
    GrowthPlanService.updatePlanAction({
      ...data,
      projectId: context.projectId,
      ...userActor(context.userId),
    }),
  );

export const addGrowthActionEvidence = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(addGrowthActionEvidenceInputSchema)
  .handler(({ data, context }) =>
    GrowthPlanService.addActionEvidence({
      ...data,
      projectId: context.projectId,
      ...userActor(context.userId),
    }),
  );

export const removeGrowthActionEvidence = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(removeGrowthActionEvidenceInputSchema)
  .handler(({ data, context }) =>
    GrowthPlanService.removeActionEvidence({
      ...data,
      projectId: context.projectId,
    }),
  );

// The Work page's status path joins growth_recommendations, which a plan Action
// does not have, so the plan drives transitions through its own entry point.
export const transitionGrowthPlanAction = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(transitionGrowthPlanActionInputSchema)
  .handler(({ data, context }) =>
    GrowthPlanService.transitionPlanAction(
      // Re-validated here so the version/status refinement and the legal
      // transition check run against the actor-complete input.
      transitionGrowthActionSchema.parse({
        ...data,
        projectId: context.projectId,
        ...userActor(context.userId),
      }),
    ),
  );
