import { createServerFn } from "@tanstack/react-start";
import { GrowthSettingsService } from "@/server/features/growth/services/GrowthSettingsService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  getGrowthSettingsSchema,
  growthSettingsInputSchema,
  updateGrowthSettingsSchema,
} from "@/types/schemas/growth";

export const getGrowthSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthSettingsSchema)
  .handler(async ({ context }) =>
    GrowthSettingsService.getSettings(context.projectId),
  );

export const updateGrowthSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateGrowthSettingsSchema)
  .handler(async ({ data, context }) => {
    // Strip the routing projectId before entering the domain service. The
    // authorized project scope comes only from requireProjectContext.
    const settings = growthSettingsInputSchema.parse(data);
    return GrowthSettingsService.updateSettings(
      {
        projectId: context.projectId,
        projectDomain: context.project.domain,
      },
      settings,
    );
  });
