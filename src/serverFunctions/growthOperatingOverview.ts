import { createServerFn } from "@tanstack/react-start";
import { GrowthOperatingOverviewService } from "@/server/features/growth/services/GrowthOperatingOverviewService";
import { growthOperatingOverviewRequestSchema } from "@/types/schemas/growth-operating-overview";
import { requireProjectContext } from "./middleware";

export const getGrowthOperatingOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(growthOperatingOverviewRequestSchema)
  .handler(({ context }) =>
    GrowthOperatingOverviewService.getOperatingOverview(context.projectId),
  );
