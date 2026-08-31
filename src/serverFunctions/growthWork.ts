import { createServerFn } from "@tanstack/react-start";
import { GrowthInvestigationsService } from "@/server/features/growth/services/GrowthInvestigationsService";
import { GrowthWorkChangesService } from "@/server/features/growth/services/GrowthWorkChangesService";
import {
  getGrowthWorkChangesSchema,
  getGrowthWorkHistorySchema,
  linkGrowthWorkChangeSchema,
  updateGrowthWorkStatusSchema,
} from "@/types/schemas/growth-work";
import { requireProjectContext } from "./middleware";

export const updateGrowthWorkStatus = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateGrowthWorkStatusSchema)
  .handler(({ data, context }) =>
    GrowthInvestigationsService.updateWorkStatus({
      ...data,
      projectId: context.projectId,
      actorId: context.userId,
    }),
  );

export const getGrowthWorkHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthWorkHistorySchema)
  .handler(({ data, context }) =>
    GrowthInvestigationsService.getWorkHistory(
      context.projectId,
      data.actionId,
    ),
  );

export const getGrowthWorkChanges = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthWorkChangesSchema)
  .handler(({ data, context }) =>
    GrowthWorkChangesService.getGrowthWorkChanges(
      context.projectId,
      data.actionId,
    ),
  );

export const linkGrowthWorkChange = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(linkGrowthWorkChangeSchema)
  .handler(({ data, context }) =>
    GrowthWorkChangesService.linkGrowthWorkChange({
      ...data,
      projectId: context.projectId,
    }),
  );
