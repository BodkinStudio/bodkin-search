import { createServerFn } from "@tanstack/react-start";
import { GrowthOpportunitiesService } from "@/server/features/growth/services/GrowthOpportunitiesService";
import { growthOpportunitiesRequestSchema } from "@/types/schemas/growth-opportunities";
import { requireProjectContext } from "./middleware";

export const getGrowthOpportunities = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(growthOpportunitiesRequestSchema)
  .handler(({ context }) =>
    GrowthOpportunitiesService.listOpportunities(context.projectId),
  );
