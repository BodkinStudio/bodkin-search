import { GrowthOpportunityDecisionsRepository } from "../repositories/GrowthOpportunityDecisionsRepository";
import { GrowthPriorityRecommendationsReadService } from "./GrowthPriorityRecommendationsReadService";
import {
  growthOpportunitiesPageDtoSchema,
  type GrowthOpportunitiesPageDto,
} from "@/types/schemas/growth-opportunities";

const OPPORTUNITIES_PAGE_SIZE = 20;

async function listOpportunities(
  projectId: string,
): Promise<GrowthOpportunitiesPageDto> {
  const page =
    await GrowthPriorityRecommendationsReadService.listPriorityRecommendations({
      projectId,
      limit: OPPORTUNITIES_PAGE_SIZE,
    });
  const sources =
    await GrowthOpportunityDecisionsRepository.listActiveControllerSources(
      projectId,
      page.recommendations.map((recommendation) => recommendation.id),
    );
  const sourceByRecommendation = new Map(
    sources.map((source) => [source.recommendationId, source.signalId]),
  );
  return growthOpportunitiesPageDtoSchema.parse({
    ...page,
    recommendations: page.recommendations.map((recommendation) => ({
      recommendation,
      reviewSource: sourceByRecommendation.has(recommendation.id)
        ? { signalId: sourceByRecommendation.get(recommendation.id)! }
        : null,
    })),
  });
}

export const GrowthOpportunitiesService = { listOpportunities } as const;
