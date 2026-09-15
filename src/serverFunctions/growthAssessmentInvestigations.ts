import { createServerFn } from "@tanstack/react-start";
import { GrowthAssessmentInvestigationsService } from "@/server/features/growth/services/GrowthAssessmentInvestigationsService";
import { growthAssessmentInvestigationRequestSchema } from "@/types/schemas/growth-assessment-investigations";
import { requireProjectContext } from "./middleware";

export const getGrowthAssessmentInvestigation = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(growthAssessmentInvestigationRequestSchema)
  .handler(({ data, context }) =>
    GrowthAssessmentInvestigationsService.getInvestigation(
      context.projectId,
      data.assessmentId,
    ),
  );

export const runGrowthAssessmentInvestigation = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(growthAssessmentInvestigationRequestSchema)
  .handler(({ data, context }) =>
    GrowthAssessmentInvestigationsService.runInvestigation(
      context.projectId,
      data.assessmentId,
      data.retryLimited,
      {
        organizationId: context.organizationId,
        userId: context.userId,
        userEmail: context.userEmail,
      },
    ),
  );
