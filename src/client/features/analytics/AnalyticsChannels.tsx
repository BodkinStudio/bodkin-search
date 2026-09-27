import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Ga4Card } from "@/client/features/dashboard/Ga4Card";
import { LinkedInPageContentCard } from "@/client/features/dashboard/LinkedInPageContentCard";
import { YouTubeCard } from "@/client/features/dashboard/YouTubeCard";
import { YouTubeContentCard } from "@/client/features/dashboard/YouTubeContentCard";
import {
  AdminConnectsIntegrationCard,
  IntegrationConnectionCard,
} from "@/client/features/integrations/IntegrationConnectionCard";
import { useWorkspaceAccess } from "@/client/features/workspaces/useWorkspaceAccess";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getDashboardActivation } from "@/serverFunctions/dashboard";

// The channels this project reports on beyond its own site: Google Analytics,
// YouTube and LinkedIn. Each card handles its own connect or empty state.
export function AnalyticsChannels({ projectId }: { projectId: string }) {
  const canConfigure = useWorkspaceAccess().can("configure");
  const activation = useQuery({
    queryKey: ["dashboardActivation", projectId],
    queryFn: () => getDashboardActivation({ data: { projectId } }),
  });

  if (activation.isPending)
    return (
      <div role="status" className="grid gap-4 lg:grid-cols-2">
        <span className="sr-only">Loading channels</span>
        <div className="skeleton h-64" />
        <div className="skeleton h-64" />
      </div>
    );
  if (activation.isError)
    return (
      <div role="alert" className="alert alert-error text-sm">
        {getStandardErrorMessage(activation.error)}
      </div>
    );

  const youtubeConnected = activation.data.youtube.connected;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Ga4Card
        projectId={projectId}
        connected={activation.data.ga4.connected}
      />
      {youtubeConnected ? (
        <>
          <YouTubeCard projectId={projectId} />
          <YouTubeContentCard projectId={projectId} />
        </>
      ) : canConfigure ? (
        <IntegrationConnectionCard title="YouTube" status="disconnected">
          <p className="text-sm text-base-content/70">
            Connect a channel to see views, watch time and which videos bring
            people to your site.
          </p>
          <Link
            to="/p/$projectId/settings/integrations"
            params={{ projectId }}
            className="btn btn-sm mt-3"
          >
            Connect YouTube
          </Link>
        </IntegrationConnectionCard>
      ) : (
        <AdminConnectsIntegrationCard title="YouTube" />
      )}
      <LinkedInPageContentCard projectId={projectId} />
    </div>
  );
}
