import { createServerFn } from "@tanstack/react-start";
import { GrowthMonthlyReportsService } from "@/server/features/growth/services/GrowthMonthlyReportsService";
import {
  buildGrowthMonthlyReportRequestSchema,
  getGrowthMonthlyReportRequestSchema,
  publishGrowthMonthlyReportRequestSchema,
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

export const getGrowthMonthlyPublicationStatus = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(publishGrowthMonthlyReportRequestSchema)
  .handler(async ({ data, context }) =>
    GrowthMonthlyReportsService.getGrowthMonthlyPublicationStatus(
      context.projectId,
      data,
    ),
  );

export const publishGrowthMonthlyReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(publishGrowthMonthlyReportRequestSchema)
  .handler(async ({ data, context }) =>
    GrowthMonthlyReportsService.publishGrowthMonthlyReport(
      context.projectId,
      context.userId,
      data,
    ),
  );
