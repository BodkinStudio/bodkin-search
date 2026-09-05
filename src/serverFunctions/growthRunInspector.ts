import { createServerFn } from "@tanstack/react-start";
import { GrowthRunInspectorService } from "@/server/features/growth/services/GrowthRunInspectorService";
import { growthRunInspectorRequestSchema } from "@/types/schemas/growth-run-inspector";
import { requireProjectContext } from "./middleware";

export const getGrowthRunInspector = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(growthRunInspectorRequestSchema)
  .handler(({ context }) =>
    GrowthRunInspectorService.getRunInspector(context.projectId),
  );
