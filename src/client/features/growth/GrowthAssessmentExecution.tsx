import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGrowthAssessmentInvestigation,
  runGrowthAssessmentInvestigation,
} from "@/serverFunctions/growthAssessmentInvestigations";
import { GrowthAssessmentFindings } from "./GrowthAssessmentFindings";

const incompleteCopy = {
  legacy: {
    title: "This page has not been assessed yet",
    description:
      "The earlier checks recorded links and Analytics setup. They did not establish whether this page should be a growth priority.",
    button: "Investigate whether this page deserves work",
  },
  invalid: {
    title: "This recommendation needs replacing",
    description:
      "The saved draft did not pass the evidence and clarity checks. It is no longer shown as a recommendation. Generate a replacement before deciding on page work.",
    button: "Replace recommendation",
  },
};

export function GrowthAssessmentExecution({
  projectId,
  assessmentId,
  autoStart,
  onBusyChange,
}: {
  projectId: string;
  assessmentId: string;
  autoStart: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const client = useQueryClient();
  const [requested, setRequested] = useState(autoStart);
  const key = ["growthAssessmentInvestigation", projectId, assessmentId];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      getGrowthAssessmentInvestigation({ data: { projectId, assessmentId } }),
    refetchInterval: (state) =>
      requested || state.state.data?.status === "running" ? 2000 : false,
  });
  const run = useMutation({
    mutationFn: (retryLimited: boolean) =>
      runGrowthAssessmentInvestigation({
        data: { projectId, assessmentId, retryLimited },
      }),
    onMutate: () => setRequested(true),
    onSuccess: (data) => client.setQueryData(key, data),
    onSettled: () => {
      setRequested(false);
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const missingCopy =
    incompleteCopy[query.data?.decisionNeedsRefresh ? "invalid" : "legacy"];
  const blocked = run.error?.message === "VALIDATION_ERROR";
  const started = useRef(false);
  const start = run.mutate;
  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      start(false);
    }
  }, [autoStart, start]);
  const stale =
    query.data?.status === "running" &&
    Date.parse(query.data.staleAfter) <= Date.now();
  const busy = run.isPending || (query.data?.status === "running" && !stale);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  return (
    <div
      className="mt-6 max-w-3xl border-t border-base-300 pt-6"
      aria-label="Investigation progress and findings"
    >
      {busy ? (
        <div role="status" aria-live="polite">
          <h3 className="font-semibold">
            Investigating your agreed direction…
          </h3>
          <p className="mt-2 text-sm text-base-content/75">
            {query.data?.stages.page === "completed" ||
            query.data?.stages.page === "limited"
              ? "Comparing the page with the search evidence and your business goal to decide whether it deserves work."
              : "Reading the page and gathering the search evidence behind this suggestion."}
          </p>
          <p className="mt-2 text-xs text-base-content/60">
            Results will appear here and remain available after a refresh. No
            website changes are being made.
          </p>
        </div>
      ) : query.data?.status === "completed" && query.data.decision ? (
        <div>
          <GrowthAssessmentFindings investigation={query.data} />
          {query.data.limitations.length ? (
            <button
              className="btn btn-outline btn-sm mt-4"
              onClick={() => start(true)}
            >
              Retry unavailable checks
            </button>
          ) : null}
        </div>
      ) : query.data?.status === "completed" ? (
        <div>
          <h3 className="font-semibold">{missingCopy.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-base-content/75">
            {missingCopy.description}
          </p>
          <button
            className="btn btn-primary btn-sm mt-4"
            onClick={() => start(false)}
          >
            {missingCopy.button}
          </button>
          <p className="mt-2 text-xs text-base-content/60">
            Uses the page, search evidence and your agreed goal. Your website
            will not be changed.
          </p>
          {run.error ? (
            <p role="alert" className="mt-3 text-sm">
              The investigation did not finish. Your earlier checks are saved;
              try again.
            </p>
          ) : null}
        </div>
      ) : query.isPending && !run.error ? (
        <p role="status" className="text-sm">
          Checking investigation status…
        </p>
      ) : query.isError ? (
        <div role="alert">
          <p className="text-sm">
            We couldn’t load the investigation status. Check again before
            starting another attempt.
          </p>
          <button
            className="btn btn-outline btn-sm mt-3"
            onClick={() => void query.refetch()}
          >
            Reload status
          </button>
        </div>
      ) : (
        <div>
          <h3 className="font-semibold">
            {query.data?.status === "failed" || stale || run.error
              ? "The investigation needs another attempt"
              : "Ready to investigate"}
          </h3>
          <p
            className="mt-2 text-sm text-base-content/75"
            role={
              run.error || query.data?.status === "failed" ? "alert" : undefined
            }
          >
            {(blocked
              ? "This direction does not have a usable cited project page to investigate. Use Reconsider next step below to choose a supported check."
              : null) ||
              query.data?.failureMessage ||
              (stale
                ? "The previous attempt was interrupted. Retry to finish the checks."
                : run.error
                  ? "The investigation request did not finish. Your agreement is saved; retry the checks below."
                  : "Your direction is agreed, but no investigation has run yet. Assess the page against your business goal and the search evidence before deciding what to change.")}
          </p>
          {!blocked ? (
            <button
              className="btn btn-primary btn-sm mt-4"
              onClick={() => start(false)}
            >
              {query.data || run.error
                ? "Retry investigation"
                : "Start investigation"}
            </button>
          ) : null}
          <p className="mt-2 text-xs text-base-content/60">
            Returns a recommendation with evidence. It does not change your
            website.
          </p>
        </div>
      )}
    </div>
  );
}
