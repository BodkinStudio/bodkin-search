import { createFileRoute } from "@tanstack/react-router";
import { GrowthOperationsPage } from "@/client/features/growth/GrowthOperationsPage";

export const Route = createFileRoute(
  "/_project/p/$projectId/growth/operations",
)({
  component: GrowthOperationsRoute,
});

function GrowthOperationsRoute() {
  const { projectId } = Route.useParams();
  return <GrowthOperationsPage key={projectId} projectId={projectId} />;
}
