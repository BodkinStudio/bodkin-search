import { createServerFn } from "@tanstack/react-start";
import { GrowthMonthlyReportsService } from "@/server/features/growth/services/GrowthMonthlyReportsService";
import {
  buildGrowthMonthlyReportRequestSchema,
  getGrowthMonthlyReportRequestSchema,
} from "@/types/schemas/growth-monthly-reports";
import { requireProjectContext } from "./middleware";

export const getGrowthMonthlyReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthMonthlyReportRequestSchema)
  .handler(async ({ data, context }) =>
    GrowthMonthlyReportsService.getGrowthMonthlyReport(context.projectId, data),
  );

export const buildGrowthMonthlyReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(buildGrowthMonthlyReportRequestSchema)
  .handler(async ({ data, context }) =>
    GrowthMonthlyReportsService.buildGrowthMonthlyReport(
      context.projectId,
      context.userId,
      data,
    ),
  );
