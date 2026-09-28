import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AnalyticsSetup } from "@/client/features/analytics/AnalyticsSetup";

export const Route = createFileRoute(
  "/_project/p/$projectId/settings/analytics",
)({
  validateSearch: z.object({
    section: z
      .enum(["install", "measurement", "reporting", "privacy"])
      .default("install")
      .catch("install"),
  }),
  component: AnalyticsSettingsPage,
});

function AnalyticsSettingsPage() {
  const { projectId } = Route.useParams();
  const { section } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ClientOnly fallback={<p role="status">Loading tracking settings…</p>}>
      <AnalyticsSetup
        projectId={projectId}
        section={section}
        onSection={(next) =>
          void navigate({ search: { section: next }, replace: true })
        }
      />
    </ClientOnly>
  );
}
