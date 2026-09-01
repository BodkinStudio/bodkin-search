import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { getGrowthPreview } from "@/serverFunctions/growthPreview";
import { GrowthPreviewWorkspace } from "./GrowthPreviewWorkspace";
import { GrowthPriorityPageChecks } from "./GrowthPriorityPageChecks";
import { GrowthChangeLog } from "./GrowthChangeLog";
import { GrowthWork } from "./GrowthWork";
import { GrowthMonthlyReport } from "./GrowthMonthlyReport";

export function GrowthPreviewPage({ projectId }: { projectId: string }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
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
          </div>
          <p className="mt-1 text-sm text-base-content/70">
            Find priority pages that need attention, record the work, measure
            outcomes and turn the saved record into a monthly summary.
          </p>
          <nav
            aria-label="Growth sections"
            className="mt-2 flex flex-wrap gap-4 text-sm"
          >
            <a href="#growth-monthly-summary" className="link">
              View monthly summary
            </a>
            <a href="#growth-work" className="link">
              View work
            </a>
            <a href="#growth-change-log" className="link">
              View change log
            </a>
          </nav>
        </header>

        <GrowthMonthlyReport key={projectId} projectId={projectId} />
        <GrowthPriorityPageChecks
          projectId={projectId}
          selectedRunId={selectedRunId}
          onSelectRun={setSelectedRunId}
        />
        <GrowthWork projectId={projectId} onOpenCheck={setSelectedRunId} />
        <GrowthChangeLog projectId={projectId} />

        <details className="rounded-lg border border-base-300 bg-base-100 px-4 py-3">
          <summary className="cursor-pointer font-medium">
            View synthetic sample evidence
          </summary>
          <aside aria-label="Sample data disclosure" className="mt-3 text-sm">
            <p className="font-medium">
              You are viewing sample data for example.com.
            </p>
            <p className="mt-1 text-base-content/70">
              This secondary demonstration is the same for every project. It
              does not read your connected data, generate AI recommendations or
              save any work.
            </p>
          </aside>
          <div className="mt-4">
            {query.isPending ? (
              <GrowthPreviewRequestState status="pending" />
            ) : null}
            {query.isError ? (
              <GrowthPreviewRequestState
                status="error"
                onRetry={() => void query.refetch()}
              />
            ) : null}
            {query.isSuccess ? (
              <GrowthPreviewWorkspace data={query.data} />
            ) : null}
          </div>
        </details>
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
