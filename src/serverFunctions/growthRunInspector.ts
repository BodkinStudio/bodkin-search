import { createServerFn } from "@tanstack/react-start";
import { GrowthRunInspectorService } from "@/server/features/growth/services/GrowthRunInspectorService";
import { GrowthMonthlyCycleOperatorObservationsService } from "@/server/features/growth/services/GrowthMonthlyCycleOperatorObservationsService";
import { growthRunInspectorRequestSchema } from "@/types/schemas/growth-run-inspector";
import { appendGrowthMonthlyCycleOperatorObservationSchema } from "@/types/schemas/growth-monthly-cycle-operator-observations";
import { requireProjectContext } from "./middleware";

export const getGrowthRunInspector = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(growthRunInspectorRequestSchema)
  .handler(({ context }) =>
    GrowthRunInspectorService.getRunInspector(context.projectId),
  );

export const appendGrowthMonthlyCycleOperatorObservation = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(appendGrowthMonthlyCycleOperatorObservationSchema)
  .handler(({ data, context }) =>
    GrowthMonthlyCycleOperatorObservationsService.appendObservation({
      ...data,
      projectId: context.projectId,
      actorId: context.userId,
    }),
  );
