/* eslint-disable max-lines -- live checks and their saved decline history remain one established card module */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";
import { GrowthCheckDetail } from "./GrowthCheckDetail";
import { runGrowthCheckSchema } from "@/types/schemas/growth-checks";
import {
  getGrowthCheckRun,
  getGrowthChecksOverview,
  runGrowthCheck,
  runGrowthStrikingDistanceCheck,
} from "@/serverFunctions/growthChecks";

type GrowthStrikingDistanceCheckResult = Awaited<
  ReturnType<typeof runGrowthStrikingDistanceCheck>
>;

function newGrowthCheckRequestKey() {
  return crypto.randomUUID().replaceAll("-", "");
}

function pendingCheckStorageKey(projectId: string) {
  return `growth:priority-page-check:${projectId}`;
}

function pendingStrikingDistanceStorageKey(projectId: string) {
  return `growth:striking-distance-check:${projectId}`;
}

function readPendingCheck(projectId: string) {
  if (typeof window === "undefined") return null;
  try {
    const parsed = runGrowthCheckSchema.shape.requestKey.safeParse(
      window.sessionStorage.getItem(pendingCheckStorageKey(projectId)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readPendingStrikingDistanceCheck(projectId: string) {
  if (typeof window === "undefined") return null;
  try {
    const parsed = runGrowthCheckSchema.shape.requestKey.safeParse(
      window.sessionStorage.getItem(
        pendingStrikingDistanceStorageKey(projectId),
      ),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function formatCheckStartedAt(value: string) {
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function GrowthStrikingDistanceCheckStatus({
  result,
}: {
  result: GrowthStrikingDistanceCheckResult;
}) {
  const resultPrefix = result.replayed ? "Retrieved the saved result. " : "";
  const foundSummary = `Found ${result.candidateCount} eligible ranking ${result.candidateCount === 1 ? "opportunity" : "opportunities"}. Newly saved: ${result.savedOpportunityCount}. Already covered: ${result.alreadyCoveredCount}.`;
  const hasReviewableResult =
    result.savedOpportunityCount > 0 || result.alreadyCoveredCount > 0;
  const reviewLink = hasReviewableResult ? (
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
        {resultPrefix}This ranking-opportunity check is still running. Retry the
        saved request to retrieve its outcome.
      </p>
    );
  if (result.run.status === "failed")
    return (
      <div role="alert" className="alert alert-error py-3 text-sm">
        <span>
          {resultPrefix}The ranking-opportunity check failed.{" "}
          {result.run.failureMessage ??
            "No ranking-opportunity suggestion was saved."}
        </span>
      </div>
    );
  if (result.run.status === "completed_with_errors")
    return (
      <div role="alert" className="alert alert-warning py-3 text-sm">
        <span>
          {resultPrefix}
          {result.run.failureCode === "INCOMPLETE_QUERY_INVENTORY"
            ? "Search Console query data was incomplete, so no ranking opportunity was saved."
            : `The ranking-opportunity check completed with errors. ${result.run.failureMessage ?? "Some suggestions could not be saved."} ${foundSummary}`}
          {reviewLink}
        </span>
      </div>
    );
  if (result.candidateCount === 0)
    return (
      <p role="status" className="text-sm text-base-content/70">
        {resultPrefix}No eligible ranking opportunities were found in the
        completed Search Console inventory. No new suggestion was saved.
      </p>
    );
  return (
    <p role="status" className="text-sm text-base-content/70">
      {resultPrefix}
      {foundSummary}
      {reviewLink}
    </p>
  );
}

// eslint-disable-next-line max-lines-per-function -- the established card owns both retry-safe checks and decline history
export function GrowthPriorityPageChecks({
  projectId,
  selectedRunId,
  onSelectRun,
}: {
  projectId: string;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}) {
  const client = useQueryClient();
  const [requestKey, setRequestKey] = useState(() =>
    readPendingCheck(projectId),
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const [strikingDistanceRequestKey, setStrikingDistanceRequestKey] = useState(
    () => readPendingStrikingDistanceCheck(projectId),
  );
  const [strikingDistanceStorageError, setStrikingDistanceStorageError] =
    useState<string | null>(null);
  const [strikingDistanceResult, setStrikingDistanceResult] =
    useState<GrowthStrikingDistanceCheckResult | null>(null);
  const overview = useQuery({
    queryKey: ["growthChecks", projectId],
    queryFn: () => getGrowthChecksOverview({ data: { projectId } }),
    retry: false,
  });
  const run = useQuery({
    queryKey: ["growthCheckRun", projectId, selectedRunId],
    queryFn: () =>
      getGrowthCheckRun({ data: { projectId, runId: selectedRunId! } }),
    enabled: selectedRunId != null,
    retry: false,
  });
  const start = useMutation({
    mutationFn: (key: string) =>
      runGrowthCheck({ data: { projectId, requestKey: key } }),
    onSuccess: (result) => {
      if (result.run.status !== "running") {
        try {
          window.sessionStorage.removeItem(pendingCheckStorageKey(projectId));
        } catch {
          // A stale terminal identity is safe to replay after a reload.
        }
        setRequestKey(null);
      }
      onSelectRun(result.run.id);
      void client.invalidateQueries({ queryKey: ["growthChecks", projectId] });
      void client.invalidateQueries({
        queryKey: ["growthCheckRun", projectId, result.run.id],
      });
    },
  });
  const findStrikingDistance = useMutation({
    mutationFn: (key: string) =>
      runGrowthStrikingDistanceCheck({
        data: { projectId, requestKey: key },
      }),
    onSuccess: (result) => {
      setStrikingDistanceResult(result);
      if (result.run.status !== "running") {
        try {
          window.sessionStorage.removeItem(
            pendingStrikingDistanceStorageKey(projectId),
          );
        } catch {
          // A stale terminal identity is safe to replay after a reload.
        }
        setStrikingDistanceRequestKey(null);
      }
      if (
        result.run.status === "completed" ||
        result.run.status === "completed_with_errors"
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
  const refresh = () => {
    void overview.refetch();
    if (selectedRunId) void run.refetch();
  };
  const submit = (newAttempt = false) => {
    const key = (!newAttempt && requestKey) || newGrowthCheckRequestKey();
    try {
      // Only a retry nonce is saved here, never source data or credentials.
      window.sessionStorage.setItem(pendingCheckStorageKey(projectId), key);
    } catch {
      setStorageError(
        "Allow browser session storage before running a check so a retry can be recovered after a reload.",
      );
      return;
    }
    setStorageError(null);
    setRequestKey(key);
    start.mutate(key);
  };
  const submitStrikingDistance = (newAttempt = false) => {
    const key =
      (!newAttempt && strikingDistanceRequestKey) || newGrowthCheckRequestKey();
    try {
      // Only a retry nonce is saved here, never source data or credentials.
      window.sessionStorage.setItem(
        pendingStrikingDistanceStorageKey(projectId),
        key,
      );
    } catch {
      setStrikingDistanceStorageError(
        "Allow browser session storage before finding ranking opportunities so a retry can be recovered after a reload.",
      );
      return;
    }
    setStrikingDistanceStorageError(null);
    setStrikingDistanceResult(null);
    setStrikingDistanceRequestKey(key);
    findStrikingDistance.mutate(key);
  };

  if (overview.isPending)
    return (
      <section
        aria-labelledby="growth-live-check-title"
        className="rounded-lg border border-base-300 bg-base-100 p-5"
      >
        <h2 id="growth-live-check-title" className="text-lg font-semibold">
          Check priority pages
        </h2>
        <p role="status" aria-busy="true">
          Loading saved priority-page checks…
        </p>
      </section>
    );
  if (overview.isError)
    return (
      <section
        aria-labelledby="growth-live-check-title"
        className="alert alert-error flex-wrap"
      >
        <h2 id="growth-live-check-title" className="font-semibold">
          Check priority pages
        </h2>
        <p>Saved priority-page checks could not be loaded.</p>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void overview.refetch()}
        >
          Retry saved results
        </button>
      </section>
    );
  const data = overview.data;
  return (
    <section
      aria-labelledby="growth-live-check-title"
      className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="growth-live-check-title" className="text-lg font-semibold">
            Check priority pages
          </h2>
          <p className="mt-1 max-w-prose text-sm text-base-content/70">
            Compare two adjacent 28-day Search Console windows. Results use
            final data at least three Pacific days old.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={refresh}
          >
            Refresh saved results
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={
              (data.setup !== "ready" && !requestKey) || start.isPending
            }
            onClick={() => submit()}
          >
            {start.isPending
              ? "Running check…"
              : requestKey
                ? "Retry previous request"
                : "Run check"}
          </button>
          {requestKey ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={data.setup !== "ready" || start.isPending}
              onClick={() => submit(true)}
            >
              Start new check
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 border-t border-base-300 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Find ranking opportunities</h3>
            <p className="mt-1 max-w-prose text-sm text-base-content/70">
              Find queries ranking in positions 5–20 on configured priority
              pages with at least 50 impressions in the current final 28-day
              window, using the preceding 28 days as evidence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              aria-busy={findStrikingDistance.isPending}
              disabled={
                data.setup !== "ready" || findStrikingDistance.isPending
              }
              onClick={() => submitStrikingDistance()}
            >
              {findStrikingDistance.isPending
                ? "Finding opportunities…"
                : strikingDistanceRequestKey
                  ? "Retry ranking-opportunity request"
                  : "Find ranking opportunities"}
            </button>
            {strikingDistanceRequestKey ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={
                  data.setup !== "ready" || findStrikingDistance.isPending
                }
                onClick={() => submitStrikingDistance(true)}
              >
                Start new ranking-opportunity check
              </button>
            ) : null}
          </div>
        </div>
        {findStrikingDistance.isPending ? (
          <p
            role="status"
            aria-busy="true"
            className="mt-3 text-sm text-base-content/70"
          >
            Finding ranking opportunities in final Search Console data…
          </p>
        ) : strikingDistanceRequestKey && !strikingDistanceResult ? (
          <p role="status" className="mt-3 text-sm text-base-content/70">
            A previous ranking-opportunity request has no confirmed outcome yet.
            Retry it to retrieve the saved result, or explicitly start a
            separate check.
          </p>
        ) : null}
        {strikingDistanceStorageError ? (
          <p role="alert" className="mt-3 text-sm text-error">
            {strikingDistanceStorageError}
          </p>
        ) : null}
        {findStrikingDistance.isError ? (
          <div role="alert" className="alert alert-error mt-3 py-3 text-sm">
            <span>
              {getStandardErrorMessage(
                findStrikingDistance.error,
                "Ranking opportunities could not be checked. Retry this request or start a new explicit check.",
              )}
            </span>
          </div>
        ) : null}
        {strikingDistanceResult && !findStrikingDistance.isPending ? (
          <div className="mt-3">
            <GrowthStrikingDistanceCheckStatus
              result={strikingDistanceResult}
            />
          </div>
        ) : null}
      </div>
      {requestKey && !start.isPending ? (
        <p role="status" className="mt-3 text-sm text-base-content/70">
          A previous request has no confirmed outcome yet. Retry it to retrieve
          the saved result, or explicitly start a separate check.
        </p>
      ) : null}
      {storageError ? (
        <p role="alert" className="mt-3 text-sm text-error">
          {storageError}
        </p>
      ) : null}
      {data.setup === "missing_connection" ? (
        <div role="alert" className="alert mt-4">
          <span>
            Connect a Search Console property before running a check.{" "}
            <Link
              className="link"
              to="/p/$projectId/settings/integrations"
              params={{ projectId }}
            >
              Open integrations
            </Link>
            .
          </span>
        </div>
      ) : null}
      {data.setup === "missing_key_pages" ? (
        <div role="alert" className="alert mt-4">
          <span>
            Add at least one key page before running a check.{" "}
            <Link
              className="link"
              to="/p/$projectId/settings/context"
              params={{ projectId }}
            >
              Open project context
            </Link>
            .
          </span>
        </div>
      ) : null}
      {start.isError ? (
        <div role="alert" className="alert alert-error mt-4 flex-wrap">
          <span>
            {getStandardErrorMessage(
              start.error,
              "The check could not be started. Retry this request or start a new explicit check.",
            )}
          </span>
        </div>
      ) : null}
      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div>
          <h3 className="font-semibold">Saved checks</h3>
          {data.runs.length === 0 ? (
            <p className="mt-2 text-sm text-base-content/70">
              No saved checks yet. A completed check with no declines is not
              proof that every page is healthy.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {data.runs.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={selectedRunId === item.id}
                    onClick={() => onSelectRun(item.id)}
                    className={`w-full rounded-md border p-3 text-left text-sm hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-primary ${
                      selectedRunId === item.id
                        ? "border-primary bg-base-200"
                        : "border-base-300"
                    }`}
                  >
                    <span className="block font-medium">
                      {formatCheckStartedAt(item.startedAt)}
                    </span>
                    <span className="mt-1 block text-xs text-base-content/70">
                      {formatGrowthPreviewDate(item.periodStart)} –{" "}
                      {formatGrowthPreviewDate(item.periodEnd)}
                    </span>
                    <span className="mt-1 block text-xs text-base-content/70">
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          {run.isSuccess ? (
            <p className="mb-2 text-sm font-medium">
              Check started {formatCheckStartedAt(run.data.run.startedAt)}
            </p>
          ) : null}
          <GrowthCheckDetail query={run} projectId={projectId} />
        </div>
      </div>
    </section>
  );
}
