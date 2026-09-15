import { createServerFn } from "@tanstack/react-start";
import { GrowthAssessmentsService } from "@/server/features/growth/services/GrowthAssessmentsService";
import {
  getGrowthAssessmentSchema,
  generateGrowthAssessmentSchema,
  confirmGrowthAssessmentSchema,
} from "@/types/schemas/growth-assessments";
import { requireProjectContext } from "./middleware";
export const getGrowthAssessment = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getGrowthAssessmentSchema)
  .handler(({ context }) =>
    GrowthAssessmentsService.getAssessment(context.projectId),
  );
export const confirmGrowthAssessment = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(confirmGrowthAssessmentSchema)
  .handler(({ data, context }) =>
    GrowthAssessmentsService.confirmAssessment(
      context.projectId,
      data.expectedVersion,
    ),
  );

export const generateGrowthAssessment = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(generateGrowthAssessmentSchema)
  .handler(({ data, context }) =>
    GrowthAssessmentsService.generateAssessment({
      ...data,
      // The route project is authorization context. Never accept a caller's
      // project id as authority, even though it remains in the request shape
      // for TanStack's project-scoped query keys.
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      userEmail: context.userEmail,
    }),
  );
