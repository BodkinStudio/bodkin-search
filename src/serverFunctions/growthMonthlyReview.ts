import { createServerFn } from "@tanstack/react-start";
import { GrowthMonthlyReviewService } from "@/server/features/growth/services/GrowthMonthlyReviewService";
import { runGrowthMonthlyReviewRequestSchema } from "@/types/schemas/growth-monthly-review";
import { requireProjectContext } from "./middleware";

export const runGrowthMonthlyReview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(runGrowthMonthlyReviewRequestSchema)
  .handler(async ({ data, context }) =>
    GrowthMonthlyReviewService.runMonthlyReview(
      context.projectId,
      context.userId,
      data,
    ),
  );
