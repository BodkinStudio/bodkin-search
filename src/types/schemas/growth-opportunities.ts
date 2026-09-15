import { z } from "zod";
import {
  growthPriorityRecommendationDtoSchema,
  growthPriorityRecommendationsPageDtoSchema,
} from "./growth-priority-recommendations";

const id = z.string().trim().min(1).max(100);

export const growthOpportunitiesRequestSchema = z.strictObject({
  // This is a route echo only. The server function replaces it with context.
  projectId: id.describe("Authorized project ID"),
});

export const growthOpportunityDtoSchema = z.strictObject({
  recommendation: growthPriorityRecommendationDtoSchema,
  reviewSource: z.strictObject({ signalId: id }).nullable(),
});

export const growthOpportunitiesPageDtoSchema = z.strictObject({
  recommendations: z.array(growthOpportunityDtoSchema).max(50),
  limit: growthPriorityRecommendationsPageDtoSchema.shape.limit,
  hasMore: z.boolean(),
  nextCursor: growthPriorityRecommendationsPageDtoSchema.shape.nextCursor,
});

export type GrowthOpportunitiesPageDto = z.output<
  typeof growthOpportunitiesPageDtoSchema
>;
