import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { withPgClient } from "@/db";
import { GrowthWeeklyReviewService } from "@/server/features/growth/services/GrowthWeeklyReviewService";
import {
  scheduledGrowthWeeklyReviewInputSchema,
  type ScheduledGrowthWeeklyReviewInput,
} from "@/types/schemas/growth-weekly-review";
import { pgStep } from "./pgStep";

const WEEKLY_REVIEW_STEP = {
  retries: { limit: 2, delay: "30 seconds" as const },
  timeout: "5 minutes" as const,
};

export class GrowthWeeklyReviewWorkflow extends WorkflowEntrypoint<
  Env,
  ScheduledGrowthWeeklyReviewInput
> {
  async run(
    event: WorkflowEvent<ScheduledGrowthWeeklyReviewInput>,
    step: WorkflowStep,
  ) {
    return withPgClient(() =>
      pgStep(step, "run-weekly-review", WEEKLY_REVIEW_STEP, () =>
        GrowthWeeklyReviewService.runScheduledWeeklyReview(
          scheduledGrowthWeeklyReviewInputSchema.parse(event.payload),
        ),
      ),
    );
  }
}
