import { createServerFn } from "@tanstack/react-start";
import { GrowthChangeLogService } from "@/server/features/growth/services/GrowthChangeLogService";
import {
  getGrowthChangeLogSchema,
  recordGrowthPageChangeSchema,
} from "@/types/schemas/growth-change-log";
import { requireProjectContext } from "./middleware";

export const getGrowthChangeLog = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthChangeLogSchema)
  .handler(async ({ context }) =>
    GrowthChangeLogService.getGrowthChangeLog(context.projectId),
  );

export const recordGrowthPageChange = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(recordGrowthPageChangeSchema)
  .handler(async ({ data, context }) =>
    GrowthChangeLogService.recordGrowthPageChange({
      ...data,
      projectId: context.projectId,
      actorId: context.userId,
    }),
  );
