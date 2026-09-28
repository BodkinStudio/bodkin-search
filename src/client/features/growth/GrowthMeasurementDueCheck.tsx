import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { runGrowthMeasurementDueCheck } from "@/serverFunctions/growthChecks";
import { runGrowthCheckSchema } from "@/types/schemas/growth-checks";

type CheckResult = Awaited<ReturnType<typeof runGrowthMeasurementDueCheck>>;

function storageKey(projectId: string) {
  return `growth:measurement-due-check:${projectId}`;
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
  if (result.run.status === "running")
    return (
      <p role="status" className="text-sm text-base-content/70">
        {prefix}This due-Measurement check is still running. Retry the saved
        request to retrieve its outcome.
      </p>
    );
  if (result.run.status === "failed")
    return (
      <div role="alert" className="alert alert-error py-3 text-sm">
        <span>
          {prefix}The due-Measurement check failed. {result.run.failureMessage}
        </span>
      </div>
    );
  if (result.run.status === "completed_with_errors")
    return (
      <div role="alert" className="alert alert-warning py-3 text-sm">
        <span>
          {prefix}
          {result.run.failureMessage ??
            "Some saved Measurements could not be checked."}{" "}
          <a className="link font-medium" href="#growth-work">
            Review Work
          </a>
          .
        </span>
      </div>
    );
  if (!result.dueCount)
    return (
      <p role="status" className="text-sm text-base-content/70">
        {prefix}No active Measurement has reached its final Search Console data
        availability date. No workflow Signal was saved.
      </p>
    );
  return (
    <p role="status" className="text-sm text-base-content/70">
      {prefix}Recorded {result.dueCount} due Measurement workflow{" "}
      {result.dueCount === 1 ? "Signal" : "Signals"}.{" "}
      <a className="link font-medium" href="#growth-work">
        Review Work
      </a>
      .
    </p>
  );
}

export function GrowthMeasurementDueCheck({
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
      runGrowthMeasurementDueCheck({
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
          queryKey: ["growthProjectSummary", projectId],
        });
        void client.invalidateQueries({
          queryKey: ["growthOperatingOverview", projectId],
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
        "Allow browser session storage before checking due Measurements so a retry can be recovered after a reload.",
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
          <h3 className="font-semibold">Record Measurements due</h3>
          <p className="mt-1 max-w-prose text-sm text-base-content/70">
            Record workflow Signals for active Measurements whose final saved
            schedule is at least three Pacific days old. This reads saved plans
            only and does not collect Search Console data.
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
              ? "Checking Measurements…"
              : requestKey
                ? "Retry due-Measurement request"
                : "Record Measurements due"}
          </button>
          {requestKey ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={check.isPending}
              onClick={() => submit(true)}
            >
              Start new due-Measurement check
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
          Checking saved Measurement schedules…
        </p>
      ) : requestKey && !result ? (
        <p role="status" className="mt-3 text-sm text-base-content/70">
          A previous due-Measurement request has no confirmed outcome yet. Retry
          it or explicitly start a separate check.
        </p>
      ) : null}
      {check.isError ? (
        <div role="alert" className="alert alert-error mt-3 py-3 text-sm">
          <span>
            {getStandardErrorMessage(
              check.error,
              "Due Measurements could not be checked. Retry this request or review the saved Work items.",
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
