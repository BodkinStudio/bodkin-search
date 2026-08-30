import { createFileRoute } from "@tanstack/react-router";
import { GrowthPreviewPage } from "@/client/features/growth/GrowthPreviewPage";

export const Route = createFileRoute("/_project/p/$projectId/growth")({
  component: GrowthRoute,
});

function GrowthRoute() {
  const { projectId } = Route.useParams();
  return <GrowthPreviewPage key={projectId} projectId={projectId} />;
}
