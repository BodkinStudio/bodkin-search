import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { runGrowthMonthlyReview } from "@/serverFunctions/growthMonthlyReview";
import {
  runGrowthMonthlyReviewRequestSchema,
  type GrowthMonthlyReviewResponse,
} from "@/types/schemas/growth-monthly-review";
import { GrowthMonthlyReviewResult } from "./GrowthMonthlyReviewResult";

function newMonthlyReviewRequestKey() {
  return crypto.randomUUID().replaceAll("-", "");
}

function pendingMonthlyReviewStorageKey(projectId: string) {
  return `growth:monthly-review:${projectId}`;
}

function readPendingMonthlyReview(projectId: string) {
  if (typeof window === "undefined") return null;
  try {
    const parsed =
      runGrowthMonthlyReviewRequestSchema.shape.requestKey.safeParse(
        window.sessionStorage.getItem(
          pendingMonthlyReviewStorageKey(projectId),
        ),
      );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function monthlyReviewErrorMessage(error: unknown) {
  const fallback =
    "Retry the previous request to retrieve its saved status, or start a separate review explicitly.";
  return getErrorCode(error)
    ? getStandardErrorMessage(error, fallback)
    : fallback;
}

export function GrowthMonthlyReview({
  projectId,
  onOpenCheck,
}: {
  projectId: string;
  onOpenCheck: (runId: string) => void;
}) {
  const client = useQueryClient();
  const dispatching = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const newReviewActionRef = useRef<HTMLButtonElement>(null);
  const [requestKey, setRequestKey] = useState(() =>
    readPendingMonthlyReview(projectId),
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const [result, setResult] = useState<GrowthMonthlyReviewResponse | null>(
    null,
  );
  const [focusResult, setFocusResult] = useState(false);
  const [focusError, setFocusError] = useState(false);
  const [confirmation, setConfirmation] = useState<"retry" | "new" | null>(
    null,
  );
  const [returnFocusTo, setReturnFocusTo] = useState<"primary" | "new" | null>(
    null,
  );

  const review = useMutation({
    mutationKey: ["growthMonthlyReview", projectId],
    mutationFn: (key: string) =>
      runGrowthMonthlyReview({ data: { projectId, requestKey: key } }),
    retry: false,
    onSuccess: (saved) => {
      setResult(saved);
      setFocusResult(true);
      if (saved.run.status !== "running") {
        try {
          window.sessionStorage.removeItem(
            pendingMonthlyReviewStorageKey(projectId),
          );
        } catch {
          // A stale terminal identity is safe to replay after a reload.
        }
        setRequestKey(null);
      }
      void client.invalidateQueries({
        queryKey: ["growthOperatingOverview", projectId],
      });
      void client.invalidateQueries({
        queryKey: ["growthChecks", projectId],
      });
      void client.invalidateQueries({
        queryKey: ["growthPriorityRecommendations", projectId],
      });
      void client.invalidateQueries({
        queryKey: ["growthMonthlyReport", projectId],
      });
      if (!saved.replayed && saved.check)
        void client.invalidateQueries({
          queryKey: ["growthCheckRun", projectId, saved.check.run.id],
        });
    },
    onError: () => setFocusError(true),
    onSettled: () => {
      dispatching.current = false;
    },
  });

  useEffect(() => {
    if (!focusResult || !result) return;
    resultRef.current?.focus();
    setFocusResult(false);
  }, [focusResult, result]);

  useEffect(() => {
    if (!focusError || !review.isError) return;
    errorRef.current?.focus();
    setFocusError(false);
  }, [focusError, review.isError]);

  useEffect(() => {
    if (confirmation != null || returnFocusTo == null) return;
    const target =
      returnFocusTo === "primary" ? primaryActionRef : newReviewActionRef;
    target.current?.focus();
    setReturnFocusTo(null);
  }, [confirmation, returnFocusTo]);

  const openConfirmation = (
    mode: "retry" | "new",
    trigger: "primary" | "new",
  ) => {
    setStorageError(null);
    setReturnFocusTo(trigger);
    setConfirmation(mode);
  };

  const submit = (newAttempt = false) => {
    if (dispatching.current || review.isPending) return;
    const key = (!newAttempt && requestKey) || newMonthlyReviewRequestKey();
    try {
      window.sessionStorage.setItem(
        pendingMonthlyReviewStorageKey(projectId),
        key,
      );
    } catch {
      setStorageError(
        "Allow browser session storage, then choose Check storage and run. Growth uses it to safely recover if the connection drops.",
      );
      setConfirmation(null);
      return;
    }
    dispatching.current = true;
    setStorageError(null);
    setRequestKey(key);
    setResult(null);
    setFocusError(false);
    setReturnFocusTo(null);
    setConfirmation(null);
    review.reset();
    review.mutate(key);
  };

  const unresolved = requestKey != null;
  return (
    <section
      id="growth-monthly-review"
      aria-labelledby="growth-monthly-review-title"
      className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="growth-monthly-review-title"
            className="text-lg font-semibold"
          >
            Monthly review
          </h2>
          <p className="mt-1 max-w-prose text-pretty text-sm text-base-content/70">
            Run the priority-page check, find Measurements due for review and
            prepare the previous month&apos;s summary in one deliberate step.
            Nothing is published, scheduled or evaluated automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            ref={primaryActionRef}
            type="button"
            className="btn btn-primary"
            disabled={review.isPending || confirmation != null}
            onClick={() =>
              openConfirmation(unresolved ? "retry" : "new", "primary")
            }
          >
            {review.isPending
              ? "Running monthly review…"
              : storageError
                ? "Check storage and run"
                : unresolved
                  ? "Retry previous request"
                  : result
                    ? "Run another review"
                    : "Run monthly review"}
          </button>
          {unresolved && !review.isPending && confirmation == null ? (
            <button
              ref={newReviewActionRef}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => openConfirmation("new", "new")}
            >
              Start new review
            </button>
          ) : null}
        </div>
      </div>

      {confirmation ? (
        <div
          role="group"
          aria-labelledby="growth-monthly-review-confirmation-title"
          className="alert mt-4 items-start border-base-300 bg-base-200/60"
        >
          <div className="min-w-0 flex-1">
            <p
              id="growth-monthly-review-confirmation-title"
              className="font-medium"
            >
              {confirmation === "retry"
                ? "Retry this saved request?"
                : "Run a monthly review now?"}
            </p>
            <p className="mt-1 max-w-prose text-sm text-base-content/70">
              {confirmation === "retry"
                ? "Growth will use the same request identity and return its saved status instead of creating a duplicate."
                : "Growth will save a new review attempt for the previous complete month. It may save a priority-page check and a draft monthly summary, but it will not publish anything."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                autoFocus
                onClick={() => submit(confirmation === "new")}
              >
                {confirmation === "retry"
                  ? "Retry saved request"
                  : "Run review now"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {review.isPending ? (
        <p role="status" aria-busy="true" className="mt-4 text-sm">
          Preparing the priority-page check, due-Measurement queue and monthly
          summary…
        </p>
      ) : null}

      {unresolved && !review.isPending && !review.isError ? (
        <p role="status" className="mt-4 text-sm text-base-content/70">
          This request has no confirmed terminal outcome. Retry it to read the
          saved status, or explicitly start a separate review.
        </p>
      ) : null}

      {storageError ? (
        <div role="alert" className="alert alert-error mt-4 items-start">
          <div>
            <p className="font-medium">Browser storage is unavailable.</p>
            <p className="mt-1 text-sm">{storageError}</p>
          </div>
        </div>
      ) : null}

      {review.isError ? (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="alert alert-error mt-4 flex-wrap"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              The monthly review could not be confirmed.
            </p>
            <p className="mt-1 text-sm">
              {monthlyReviewErrorMessage(review.error)}
            </p>
          </div>
        </div>
      ) : null}

      {result ? (
        <div ref={resultRef} tabIndex={-1}>
          <GrowthMonthlyReviewResult
            result={result}
            onOpenCheck={onOpenCheck}
          />
        </div>
      ) : null}
    </section>
  );
}
