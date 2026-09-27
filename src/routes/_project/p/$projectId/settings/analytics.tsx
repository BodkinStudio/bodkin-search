import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { AnalyticsSetup } from "@/client/features/analytics/AnalyticsSetup";
export const Route = createFileRoute(
  "/_project/p/$projectId/settings/analytics",
)({ component: AnalyticsSettingsPage });
function AnalyticsSettingsPage() {
  const { projectId } = Route.useParams();
  return (
    <ClientOnly fallback={<p role="status">Loading tracking settings…</p>}>
      <AnalyticsSetup projectId={projectId} />
    </ClientOnly>
  );
}
