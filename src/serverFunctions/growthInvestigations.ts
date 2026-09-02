import { createServerFn } from "@tanstack/react-start";
import { GrowthInvestigationsService } from "@/server/features/growth/services/GrowthInvestigationsService";
import {
  approveGrowthInvestigationSchema,
  getGrowthInvestigationSchema,
  getGrowthWorkSchema,
  reviewGrowthInvestigationSchema,
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
