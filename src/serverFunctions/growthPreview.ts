import { createServerFn } from "@tanstack/react-start";
import { buildGrowthPreview } from "@/server/features/growth/services/GrowthPreviewService";
import { getGrowthPreviewSchema } from "@/types/schemas/growth-preview";
import { requireProjectContext } from "./middleware";

export const getGrowthPreview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthPreviewSchema)
  // Authorization grants access to the preview; real project content is
  // deliberately not passed into its fixed, synthetic evidence graph.
  .handler(async () => buildGrowthPreview());
