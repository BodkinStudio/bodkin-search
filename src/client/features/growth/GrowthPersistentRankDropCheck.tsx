import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { runGrowthPersistentRankDropCheck } from "@/serverFunctions/growthChecks";
import { runGrowthCheckSchema } from "@/types/schemas/growth-checks";

type CheckResult = Awaited<ReturnType<typeof runGrowthPersistentRankDropCheck>>;

function storageKey(projectId: string) {
  return `growth:persistent-rank-drop-check:${projectId}`;
}

function readPendingRequest(projectId: string) {
  if (typeof window === "undefined") return null;
  try {
    const parsed = runGrowthCheckSchema.shape.requestKey.safeParse(
      window.sessionStorage.getItem(storageKey(projectId)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function CheckStatus({ result }: { result: CheckResult }) {
  const prefix = result.replayed ? "Retrieved the saved result. " : "";
  const summary = `Found ${result.candidateCount} persistent rank ${result.candidateCount === 1 ? "drop" : "drops"}. Newly saved: ${result.savedOpportunityCount}. Already covered: ${result.alreadyCoveredCount}.`;
  const reviewLink =
    result.savedOpportunityCount > 0 || result.alreadyCoveredCount > 0 ? (
      <>
        {" "}
        <a className="link font-medium" href="#growth-opportunities">
          Review saved opportunities
        </a>
        .
      </>
    ) : null;
  if (result.run.status === "running")
    return (
      <p role="status" className="text-sm text-base-content/70">
        {prefix}This persistent rank-drop check is still running. Retry the
        saved request to retrieve its outcome.
      </p>
    );
  if (result.run.status === "failed")
    return (
      <div role="alert" className="alert alert-error py-3 text-sm">
        <span>
          {prefix}The persistent rank-drop check failed.{" "}
          {result.run.failureMessage}
        </span>
      </div>
    );
  if (result.run.status === "completed_with_errors")
    return (
      <div role="alert" className="alert alert-warning py-3 text-sm">
        <span>
          {prefix}
          {result.run.failureMessage ??
            "Persistent rank drops could not be determined from the saved history."}
          {reviewLink}
        </span>
      </div>
    );
  if (!result.candidateCount)
    return (
      <p role="status" className="text-sm text-base-content/70">
        {prefix}No tracked keyword stayed at least three positions below its
        baseline across all three later full checks. No new suggestion was
        saved.
      </p>
    );
  return (
    <p role="status" className="text-sm text-base-content/70">
      {prefix}
      {summary}
      {reviewLink}
    </p>
  );
}

export function GrowthPersistentRankDropCheck({
  projectId,
  keyPageCount,
}: {
  projectId: string;
  keyPageCount: number;
}) {
  const client = useQueryClient();
  const [requestKey, setRequestKey] = useState(() =>
    readPendingRequest(projectId),
  );
  const [result, setResult] = useState<CheckResult | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const check = useMutation({
    mutationFn: (key: string) =>
      runGrowthPersistentRankDropCheck({
        data: { projectId, requestKey: key },
      }),
    onSuccess: (nextResult) => {
      setResult(nextResult);
      if (nextResult.run.status !== "running") {
        try {
          window.sessionStorage.removeItem(storageKey(projectId));
        } catch {
          // A stale terminal identity is safe to replay after a reload.
        }
        setRequestKey(null);
      }
      if (
        nextResult.run.status === "completed" ||
        nextResult.run.status === "completed_with_errors"
      ) {
        void client.invalidateQueries({
          queryKey: ["growthPriorityRecommendations", projectId],
        });
        void client.invalidateQueries({
          queryKey: ["growthProjectSummary", projectId],
        });
      }
    },
  });
  const submit = (newAttempt = false) => {
    const key =
      (!newAttempt && requestKey) || crypto.randomUUID().replaceAll("-", "");
    try {
      window.sessionStorage.setItem(storageKey(projectId), key);
    } catch {
      setStorageError(
        "Allow browser session storage before finding persistent rank drops so a retry can be recovered after a reload.",
      );
      return;
    }
    setStorageError(null);
    setResult(null);
    setRequestKey(key);
    check.mutate(key);
  };

  return (
    <div className="mt-4 border-t border-base-300 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Find persistent rank drops</h3>
          <p className="mt-1 max-w-prose text-sm text-base-content/70">
            Use saved rank history to find priority-page keywords that stayed at
            least three positions below one baseline across three consecutive
            later full checks. This does not run a new paid rank check.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            aria-busy={check.isPending}
            disabled={keyPageCount === 0 || check.isPending}
            onClick={() => submit()}
          >
            {check.isPending
              ? "Checking rank history…"
              : requestKey
                ? "Retry persistent rank-drop request"
                : "Find persistent rank drops"}
          </button>
          {requestKey ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={keyPageCount === 0 || check.isPending}
              onClick={() => submit(true)}
            >
              Start new persistent rank-drop check
            </button>
          ) : null}
        </div>
      </div>
      {check.isPending ? (
        <p
          role="status"
          aria-busy="true"
          className="mt-3 text-sm text-base-content/70"
        >
          Checking saved rank history…
        </p>
      ) : requestKey && !result ? (
        <p role="status" className="mt-3 text-sm text-base-content/70">
          A previous persistent rank-drop request has no confirmed outcome yet.
          Retry it or explicitly start a separate check.
        </p>
      ) : null}
      {check.isError ? (
        <div role="alert" className="alert alert-error mt-3 py-3 text-sm">
          <span>
            {getStandardErrorMessage(
              check.error,
              "Persistent rank drops could not be checked. Configure rank tracking or retry this request.",
            )}
          </span>
        </div>
      ) : null}
      {storageError ? (
        <p role="alert" className="mt-3 text-sm text-error">
          {storageError}
        </p>
      ) : null}
      {result && !check.isPending ? (
        <div className="mt-3">
          <CheckStatus result={result} />
        </div>
      ) : null}
    </div>
  );
}
