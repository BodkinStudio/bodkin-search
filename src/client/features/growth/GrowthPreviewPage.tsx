import { useQuery } from "@tanstack/react-query";
import { FlaskConical, RefreshCw } from "lucide-react";
import { getGrowthPreview } from "@/serverFunctions/growthPreview";
import { GrowthPreviewWorkspace } from "./GrowthPreviewWorkspace";

export function GrowthPreviewPage({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["growthPreview", projectId],
    queryFn: () => getGrowthPreview({ data: { projectId } }),
    retry: false,
    staleTime: Infinity,
  });

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">Growth</h1>
            <span className="badge badge-outline gap-1.5 text-xs">
              <FlaskConical size={14} aria-hidden="true" />
              Sample preview
            </span>
          </div>
          <p className="mt-1 text-sm text-base-content/70">
            Find priority pages that need attention. Inspect the evidence before
            deciding what to change.
          </p>
        </header>

        <aside
          aria-label="Sample data disclosure"
          className="rounded-lg border border-base-300 bg-base-100 px-4 py-3 text-sm"
        >
          <p className="font-medium">
            You are viewing sample data for example.com.
          </p>
          <p className="mt-1 text-base-content/70">
            This preview is the same for every project. It does not read your
            connected data, generate AI recommendations or save any work. No API
            key is needed for this sample.
          </p>
        </aside>

        {query.isPending ? (
          <GrowthPreviewRequestState status="pending" />
        ) : query.isError ? (
          <GrowthPreviewRequestState
            status="error"
            onRetry={() => void query.refetch()}
          />
        ) : (
          <GrowthPreviewWorkspace data={query.data} />
        )}
      </div>
    </div>
  );
}

export function GrowthPreviewRequestState({
  status,
  onRetry,
}: {
  status: "pending" | "error";
  onRetry?: () => void;
}) {
  if (status === "pending") {
    return (
      <div
        role="status"
        aria-busy="true"
        className="rounded-lg border border-base-300 bg-base-100 p-6"
      >
        <span
          className="loading loading-spinner loading-sm mr-2"
          aria-hidden="true"
        />
        Loading sample evidence…
      </div>
    );
  }
  return (
    <div role="alert" className="alert alert-error flex-wrap">
      <div className="flex-1">
        <p className="font-medium">The sample preview could not be loaded.</p>
        <p className="mt-1 text-sm">
          Try again. If the problem continues, check that you still have access
          to this project. No work has been saved.
        </p>
      </div>
      <button type="button" className="btn btn-sm" onClick={onRetry}>
        <RefreshCw size={14} aria-hidden="true" />
        Retry preview
      </button>
    </div>
  );
}
