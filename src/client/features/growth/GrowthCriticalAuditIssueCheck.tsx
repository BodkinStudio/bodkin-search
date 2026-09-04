import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { runGrowthCriticalAuditIssueCheck } from "@/serverFunctions/growthChecks";
import { runGrowthCheckSchema } from "@/types/schemas/growth-checks";

type CheckResult = Awaited<ReturnType<typeof runGrowthCriticalAuditIssueCheck>>;

function storageKey(projectId: string) {
  return `growth:critical-audit-issue-check:${projectId}`;
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
        {prefix}This audit comparison is still running. Retry the saved request
        to retrieve its outcome.
      </p>
    );
  if (result.run.status === "failed")
    return (
      <div role="alert" className="alert alert-error py-3 text-sm">
        <span>
          {prefix}The audit comparison failed. {result.run.failureMessage}
        </span>
      </div>
    );
  if (result.run.status === "completed_with_errors")
    return (
      <div role="alert" className="alert alert-warning py-3 text-sm">
        <span>
          {prefix}
          {result.run.failureMessage ??
            "New critical audit issues could not be determined from saved audits."}
          {reviewLink}
        </span>
      </div>
    );
  if (!result.candidateCount)
    return (
      <p role="status" className="text-sm text-base-content/70">
        {prefix}No new critical issues appeared in the latest comparable saved
        audit. No new suggestion was saved.
      </p>
    );
  return (
    <p role="status" className="text-sm text-base-content/70">
      {prefix}Found {result.candidateCount} new critical audit{" "}
      {result.candidateCount === 1 ? "issue" : "issues"}. Newly saved:{" "}
      {result.savedOpportunityCount}. Already covered:{" "}
      {result.alreadyCoveredCount}.{reviewLink}
    </p>
  );
}

export function GrowthCriticalAuditIssueCheck({
  projectId,
}: {
  projectId: string;
}) {
  const client = useQueryClient();
  const [requestKey, setRequestKey] = useState(() =>
    readPendingRequest(projectId),
  );
  const [result, setResult] = useState<CheckResult | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const check = useMutation({
    mutationFn: (key: string) =>
      runGrowthCriticalAuditIssueCheck({
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
        "Allow browser session storage before comparing audits so a retry can be recovered after a reload.",
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
          <h3 className="font-semibold">Find new critical audit issues</h3>
          <p className="mt-1 max-w-prose text-sm text-base-content/70">
            Compare the latest completed audit with its latest prior audit that
            used the same crawl start and page limit. This reads saved results
            only and does not run or charge for a new audit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            aria-busy={check.isPending}
            disabled={check.isPending}
            onClick={() => submit()}
          >
            {check.isPending
              ? "Comparing saved audits…"
              : requestKey
                ? "Retry audit comparison"
                : "Find new critical issues"}
          </button>
          {requestKey ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={check.isPending}
              onClick={() => submit(true)}
            >
              Start new audit comparison
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
          Comparing saved audit results…
        </p>
      ) : requestKey && !result ? (
        <p role="status" className="mt-3 text-sm text-base-content/70">
          A previous audit comparison has no confirmed outcome yet. Retry it or
          explicitly start a separate comparison.
        </p>
      ) : null}
      {check.isError ? (
        <div role="alert" className="alert alert-error mt-3 py-3 text-sm">
          <span>
            {getStandardErrorMessage(
              check.error,
              "Saved audits could not be compared. Retry this request or run another site audit first.",
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
