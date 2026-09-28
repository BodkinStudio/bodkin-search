import { createServerFn } from "@tanstack/react-start";
import { CompetitorResearchService } from "@/server/features/competitors/services/CompetitorResearchService";
import { competitorResearchRequestSchema } from "@/shared/competitorResearch";
import { resolveLabsMarket } from "@/shared/keyword-locations";
import { requireProjectContext } from "@/serverFunctions/middleware";

export const getCompetitorResearch = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(competitorResearchRequestSchema)
  .handler(async ({ data, context }) => {
    const market = resolveLabsMarket(data, context.project);
    return CompetitorResearchService.compare(
      {
        projectId: context.projectId,
        projectDomain: context.project.domain,
        competitorDomain: data.competitorDomain,
        topic: data.topic,
        ...market,
      },
      context,
    );
  });
