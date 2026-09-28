import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsWorkspace } from "@/client/features/analytics/AnalyticsWorkspace";
import { analyticsSearchSchema } from "@/client/features/analytics/analytics-search";
export const Route = createFileRoute("/_project/p/$projectId/analytics")({
  validateSearch: analyticsSearchSchema,
  component: AnalyticsPage,
});
function AnalyticsPage() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AnalyticsWorkspace
      projectId={projectId}
      search={search}
      onSearch={(patch) => {
        void navigate({ search: (previous) => ({ ...previous, ...patch }) });
      }}
    />
  );
}
