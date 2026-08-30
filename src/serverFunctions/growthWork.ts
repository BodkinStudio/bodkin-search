import { createServerFn } from "@tanstack/react-start";
import { GrowthInvestigationsService } from "@/server/features/growth/services/GrowthInvestigationsService";
import {
  getGrowthWorkHistorySchema,
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
