import { createServerFn } from "@tanstack/react-start";
import { GrowthInvestigationsService } from "@/server/features/growth/services/GrowthInvestigationsService";
import { generateGrowthAiBrief } from "@/server/features/growth/services/GrowthAiBriefService";
import {
  approveGrowthInvestigationSchema,
  generateGrowthAiBriefSchema,
  getGrowthInvestigationSchema,
  getGrowthWorkSchema,
  reviewGrowthInvestigationSchema,
} from "@/types/schemas/growth-investigations";
import {
  getGrowthAiBrief,
  saveGrowthAiBriefEdits,
  approveGrowthAiBrief,
} from "@/server/features/growth/services/GrowthAiBriefProposalsService";
import {
  saveGrowthAiBriefEditsSchema,
  approveGrowthAiBriefSchema,
} from "@/types/schemas/growth-investigations";
import { requireProjectContext } from "./middleware";

export const getGrowthInvestigation = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthInvestigationSchema)
  .handler(({ data, context }) =>
    GrowthInvestigationsService.getInvestigation(
      context.projectId,
      data.signalId,
    ),
  );

export const generateGrowthAiInvestigationBrief = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(generateGrowthAiBriefSchema)
  .handler(({ data, context }) =>
    generateGrowthAiBrief({
      organizationId: context.organizationId,
      projectId: context.projectId,
      signalId: data.signalId,
      userId: context.userId,
      userEmail: context.userEmail,
    }),
  );

export const approveGrowthInvestigation = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(approveGrowthInvestigationSchema)
  .handler(({ data, context }) =>
    GrowthInvestigationsService.approveInvestigation({
      projectId: context.projectId,
      signalId: data.signalId,
      dueOn: data.dueOn,
      actorId: context.userId,
    }),
  );

export const reviewGrowthInvestigation = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(reviewGrowthInvestigationSchema)
  .handler(({ data, context }) =>
    GrowthInvestigationsService.reviewInvestigation({
      ...data,
      projectId: context.projectId,
    }),
  );

export const getGrowthWork = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthWorkSchema)
  .handler(({ context }) =>
    GrowthInvestigationsService.getWork(context.projectId),
  );

export const getSavedGrowthAiBrief = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthInvestigationSchema)
  .handler(({ data, context }) =>
    getGrowthAiBrief({ projectId: context.projectId, signalId: data.signalId }),
  );

export const saveGrowthAiInvestigationBrief = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveGrowthAiBriefEditsSchema)
  .handler(({ data, context }) =>
    saveGrowthAiBriefEdits({ ...data, projectId: context.projectId }),
  );

export const approveGrowthAiInvestigationBrief = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(approveGrowthAiBriefSchema)
  .handler(({ data, context }) =>
    approveGrowthAiBrief({
      ...data,
      projectId: context.projectId,
      actorId: context.userId,
    }),
  );
