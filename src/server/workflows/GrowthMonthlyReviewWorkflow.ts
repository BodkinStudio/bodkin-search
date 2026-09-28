import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { withPgClient } from "@/db";
import { GrowthMonthlyReviewService } from "@/server/features/growth/services/GrowthMonthlyReviewService";
import {
  scheduledGrowthMonthlyReviewInputSchema,
  type ScheduledGrowthMonthlyReviewInput,
} from "@/types/schemas/growth-monthly-review";
import { pgStep } from "./pgStep";

const MONTHLY_REVIEW_STEP = {
  retries: { limit: 2, delay: "30 seconds" as const },
  timeout: "15 minutes" as const,
};

export class GrowthMonthlyReviewWorkflow extends WorkflowEntrypoint<
  Env,
  ScheduledGrowthMonthlyReviewInput
> {
  async run(
    event: WorkflowEvent<ScheduledGrowthMonthlyReviewInput>,
    step: WorkflowStep,
  ) {
    return withPgClient(() =>
      pgStep(step, "run-monthly-review", MONTHLY_REVIEW_STEP, () =>
        GrowthMonthlyReviewService.runScheduledMonthlyReview(
          scheduledGrowthMonthlyReviewInputSchema.parse(event.payload),
        ),
      ),
    );
  }
}
