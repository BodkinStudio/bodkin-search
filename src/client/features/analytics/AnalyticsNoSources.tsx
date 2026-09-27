import { Link } from "@tanstack/react-router";
import { ArrowRight, Route as RouteIcon } from "lucide-react";

export function AnalyticsNoSources({
  projectId,
  canAdminister,
}: {
  projectId: string;
  canAdminister: boolean;
}) {
  return (
    <div className="py-16 text-center">
      <RouteIcon className="mx-auto size-8 text-primary" />
      <h2 className="mt-4 text-xl font-semibold">No tracking sources yet</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-base-content/70">
        {canAdminister
          ? "Connect your website and consent mechanism to see where permitted visitors arrive, which pages they explore, and what happens next."
          : "Ask a workspace administrator to connect tracking. Reports will appear here when data is available."}
      </p>
      {canAdminister && (
        <Link
          to="/p/$projectId/settings/analytics"
          params={{ projectId }}
          className="btn btn-primary btn-sm mt-6"
        >
          Set up tracking <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}
