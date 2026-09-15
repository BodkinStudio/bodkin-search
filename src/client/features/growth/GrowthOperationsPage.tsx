import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { getGrowthPreview } from "@/serverFunctions/growthPreview";
import { GrowthPreviewWorkspace } from "./GrowthPreviewWorkspace";
import { GrowthPriorityPageChecks } from "./GrowthPriorityPageChecks";
import { GrowthChangeLog } from "./GrowthChangeLog";
import { GrowthWork } from "./GrowthWork";
import { GrowthMonthlyReport } from "./GrowthMonthlyReport";
import { GrowthOpportunities } from "./GrowthOpportunities";
import { GrowthOperatingOverview } from "./GrowthOperatingOverview";
import { GrowthLiveReadiness } from "./GrowthLiveReadiness";
import { GrowthMonthlyReview } from "./GrowthMonthlyReview";
import { GrowthRunInspector } from "./GrowthRunInspector";
import { GrowthAssessmentPanel } from "./GrowthAssessmentPanel";

export function GrowthOperationsPage({ projectId }: { projectId: string }) {
  const [showOpportunities, setShowOpportunities] = useState(false);
  const [section, setSection] = useState("priorities");
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash;
      if (hash === "#growth-opportunities") setShowOpportunities(true);
      setSection(
        /growth-(work|change-log)/.test(hash)
          ? "work"
          : /growth-monthly/.test(hash)
            ? "reports"
            : /growth-(live-readiness|live-check|run-inspector|priority-page)/.test(
                  hash,
                )
              ? "data"
              : "priorities",
      );
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
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
            <h1 className="text-2xl font-semibold">Operations</h1>
          </div>
          <p className="mt-1 text-sm text-base-content/70">
            Decide what matters next, understand the evidence, and track the
            result.
          </p>
          <nav
            aria-label="Growth sections"
            className="mt-5 flex flex-wrap gap-2 border-b border-base-300 pb-3"
          >
            {(
              [
                ["priorities", "Priorities", "growth-assessment"],
                ["work", "Work", "growth-work"],
                ["reports", "Reports", "growth-monthly-review"],
                ["data", "Data & checks", "growth-live-readiness"],
              ] as const
            ).map(([value, label, anchor]) => (
              <a
                key={value}
                href={`#${anchor}`}
                aria-current={section === value ? "page" : undefined}
                onClick={() => setSection(value)}
                className={`btn btn-sm ${section === value ? "btn-neutral" : "btn-ghost"}`}
              >
                {label}
              </a>
            ))}
          </nav>
        </header>

        <div hidden={section !== "priorities"} className="space-y-5">
          <GrowthAssessmentPanel projectId={projectId} />
          <details
            open={showOpportunities}
            onToggle={(event) => setShowOpportunities(event.currentTarget.open)}
            className="rounded-lg border border-base-300 p-4"
          >
            <summary className="cursor-pointer font-medium">
              Browse saved opportunities
            </summary>
            <div className="mt-4">
              <GrowthOpportunities projectId={projectId} />
            </div>
          </details>
        </div>
        <div hidden={section !== "work"} className="space-y-5">
          <GrowthWork
            projectId={projectId}
            onOpenCheck={(id) => {
              setSelectedRunId(id);
              setSection("data");
            }}
          />
          <GrowthChangeLog projectId={projectId} />
        </div>
        <div hidden={section !== "reports"} className="space-y-5">
          <GrowthMonthlyReview
            key={`monthly-review-${projectId}`}
            projectId={projectId}
            onOpenCheck={(id) => {
              setSelectedRunId(id);
              setSection("data");
            }}
          />
          <GrowthMonthlyReport key={projectId} projectId={projectId} />
        </div>
        <div hidden={section !== "data"} className="space-y-5">
          <GrowthLiveReadiness projectId={projectId} />
          <GrowthOperatingOverview projectId={projectId} />
          <GrowthPriorityPageChecks
            projectId={projectId}
            selectedRunId={selectedRunId}
            onSelectRun={setSelectedRunId}
          />
          <GrowthRunInspector projectId={projectId} />

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
                does not read your connected data, generate AI recommendations
                or save any work.
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
