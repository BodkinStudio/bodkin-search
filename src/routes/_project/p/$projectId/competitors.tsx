import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CompetitorResearchPage } from "@/client/features/competitors/CompetitorResearchPage";

export const Route = createFileRoute("/_project/p/$projectId/competitors")({
  validateSearch: z.object({ competitor: z.string().max(253).optional() }),
  component: CompetitorResearchRoute,
});
function CompetitorResearchRoute() {
  const { projectId } = Route.useParams();
  const { competitor } = Route.useSearch();
  return (
    <CompetitorResearchPage
      key={projectId}
      projectId={projectId}
      initialCompetitor={competitor}
    />
  );
}
