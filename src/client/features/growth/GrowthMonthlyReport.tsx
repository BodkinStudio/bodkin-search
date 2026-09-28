import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildGrowthMonthlyReport,
  getGrowthMonthlyReport,
} from "@/serverFunctions/growthReports";
import type { GrowthMonthlyReportDto } from "@/types/schemas/growth-monthly-reports";
import { formatGrowthReportMonth } from "./GrowthReportPresentation";
import { GrowthReportView } from "./GrowthReportView";
import {
  GrowthMonthlyPublicationControl,
  GrowthMonthlyPublicationRecovery,
  useGrowthMonthlyPublication,
} from "./GrowthMonthlyReportPublication";

type GrowthMonthlyReportExpectation = {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  reportTimezone: string;
};

function expectationFor(
  projectId: string,
  data: GrowthMonthlyReportDto,
): GrowthMonthlyReportExpectation {
  return {
    projectId,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    reportTimezone: data.reportTimezone,
  };
}

function sameExpectation(
  data: GrowthMonthlyReportDto,
  expectation: GrowthMonthlyReportExpectation,
) {
  return (
    data.periodStart === expectation.periodStart &&
    data.periodEnd === expectation.periodEnd &&
    data.reportTimezone === expectation.reportTimezone
  );
}

export function claimGrowthMonthlyReportDispatch(
  lock: { current: boolean },
  unavailable: boolean,
) {
  if (lock.current || unavailable) return false;
  lock.current = true;
  return true;
}

export function GrowthMonthlyReport({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const dispatching = useRef(false);
  const queryKey = ["growthMonthlyReport", projectId] as const;
  const [submitted, setSubmitted] =
    useState<GrowthMonthlyReportExpectation | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusNotice, setFocusNotice] = useState(false);
  const [focusBuildError, setFocusBuildError] = useState(false);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const buildErrorRef = useRef<HTMLDivElement>(null);
  const read = () => getGrowthMonthlyReport({ data: { projectId } });
  const query = useQuery({
    queryKey,
    queryFn: read,
    retry: false,
  });
  const build = useMutation({
    mutationKey: ["growthMonthlyReportBuild", projectId],
    mutationFn: (request: GrowthMonthlyReportExpectation) =>
      buildGrowthMonthlyReport({ data: request }),
    retry: false,
    onMutate: async () => {
      await client.cancelQueries({ queryKey });
    },
    onSuccess: (saved, request) => {
      const rolledOver = !sameExpectation(saved, request);
      client.setQueryData(queryKey, saved);
      setSubmitted(null);
      setCheckFailed(false);
      setNotice(
        rolledOver
          ? "The reporting month or timezone changed. Review the current period before choosing Build again; nothing was built automatically."
          : saved.state === "report"
            ? "Monthly summary saved as a frozen version."
            : "No eligible saved activity was available when the build ran.",
      );
      setFocusNotice(true);
    },
    onError: () => setFocusBuildError(true),
    onSettled: () => {
      dispatching.current = false;
    },
  });
  useEffect(() => {
    if (!focusNotice || !notice) return;
    noticeRef.current?.focus();
    setFocusNotice(false);
  }, [focusNotice, notice]);

  useEffect(() => {
    if (!focusBuildError) return;
    buildErrorRef.current?.focus();
    setFocusBuildError(false);
  }, [focusBuildError]);

  const publication = useGrowthMonthlyPublication({
    projectId,
    data: query.data,
    queryKey,
    client,
    dispatching,
    onSuccess: (message) => {
      setNotice(message);
      setFocusNotice(true);
    },
  });

  const refreshSummary = async () => {
    setNotice(null);
    const refreshed = await query.refetch();
    if (refreshed.isSuccess)
      setNotice(
        refreshed.data.state === "report"
          ? "Saved frozen monthly summary loaded."
          : "Monthly summary status refreshed.",
      );
  };

  const startBuild = () => {
    if (!claimGrowthMonthlyReportDispatch(dispatching, build.isPending)) return;
    const request =
      submitted ?? (query.data ? expectationFor(projectId, query.data) : null);
    if (!request) {
      dispatching.current = false;
      return;
    }
    setSubmitted(request);
    setNotice(null);
    setCheckFailed(false);
    setFocusBuildError(false);
    build.mutate(request);
  };

  const checkSavedSummary = async () => {
    if (!claimGrowthMonthlyReportDispatch(dispatching, checking)) return;
    setChecking(true);
    setCheckFailed(false);
    try {
      const request = submitted;
      const refreshed = await getGrowthMonthlyReport({
        data: request ?? { projectId },
      });
      client.setQueryData(queryKey, refreshed);
      if (refreshed.state === "report") {
        setSubmitted(null);
        build.reset();
        setNotice(
          request && !sameExpectation(refreshed, request)
            ? "The reporting month changed. The current saved summary is shown below; no report was built automatically."
            : "The saved frozen summary was found.",
        );
        setFocusNotice(true);
      } else if (request && !sameExpectation(refreshed, request)) {
        setSubmitted(null);
        build.reset();
        setNotice(
          "The reporting month or timezone changed. Review the current period before choosing Build again; nothing was built automatically.",
        );
        setFocusNotice(true);
      } else {
        setNotice(
          "No saved summary was found. You can retry the build safely.",
        );
      }
    } catch {
      setCheckFailed(true);
    } finally {
      setChecking(false);
      dispatching.current = false;
    }
  };

  const refreshing =
    query.isFetching ||
    build.isPending ||
    checking ||
    publication.pending ||
    publication.checking;
  const displayedMonth = query.data
    ? formatGrowthReportMonth(query.data.periodStart)
    : null;
  return (
    <section
      id="growth-monthly-summary"
      aria-labelledby="growth-monthly-summary-title"
      className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="growth-monthly-summary-title"
            className="text-lg font-semibold"
          >
            {displayedMonth
              ? `${displayedMonth} monthly summary`
              : "Monthly summary"}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-base-content/70">
            {query.data
              ? `Uses ${query.data.reportTimezone} calendar boundaries. Building freezes version 1 from the saved Growth record.`
              : "Turn saved Work, recorded changes and measured results into one frozen internal report for the previous completed month."}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={refreshing || Boolean(submitted) || publication.active}
          onClick={() => void refreshSummary()}
        >
          {query.isFetching ? "Refreshing summary…" : "Refresh summary"}
        </button>
      </div>

      {query.isPending ? (
        <p role="status" aria-busy="true" className="mt-4 text-sm">
          Loading monthly summary…
        </p>
      ) : null}
      {query.isError && !query.data ? (
        <div role="alert" className="mt-4 text-sm">
          <p>Monthly summary could not be loaded.</p>
          <button
            type="button"
            className="btn btn-sm mt-3"
            disabled={refreshing}
            onClick={() => void refreshSummary()}
          >
            Retry summary
          </button>
        </div>
      ) : null}
      {query.isError && query.data ? (
        <p role="alert" className="mt-4 text-sm">
          Monthly summary could not be refreshed. The last loaded state remains
          below; no report content was changed.
        </p>
      ) : null}
      {query.isFetching && !query.isPending ? (
        <p role="status" className="sr-only">
          Refreshing monthly summary…
        </p>
      ) : null}
      {notice ? (
        <p
          ref={noticeRef}
          role="status"
          tabIndex={focusNotice ? -1 : undefined}
          className="mt-4 text-sm"
        >
          {notice}
        </p>
      ) : null}
      {build.isPending ? (
        <p role="status" aria-busy="true" className="mt-4 text-sm">
          Building the frozen summary…
        </p>
      ) : null}
      {checking ? (
        <p role="status" className="sr-only">
          Checking for a saved monthly summary…
        </p>
      ) : null}
      {build.isError && submitted ? (
        <div
          ref={buildErrorRef}
          role="alert"
          tabIndex={-1}
          className="alert alert-error mt-4 flex-wrap"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium">The build could not be confirmed.</p>
            <p className="mt-1 text-sm">
              Check for a saved summary first. If the original request reached
              the server, the same frozen version will be returned.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              disabled={refreshing}
              onClick={() => void checkSavedSummary()}
            >
              {checking ? "Checking saved summary…" : "Check saved summary"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={refreshing}
              onClick={startBuild}
            >
              Retry build
            </button>
          </div>
        </div>
      ) : null}
      {checkFailed ? (
        <p role="alert" className="mt-4 text-sm">
          The saved summary could not be checked. Your build remains locked; try
          Check saved summary again.
        </p>
      ) : null}
      {query.data ? (
        <>
          <GrowthMonthlyPublicationControl
            {...publication.control}
            busy={refreshing || Boolean(submitted)}
          />
          <GrowthMonthlyReportState
            data={query.data}
            building={build.isPending}
            locked={Boolean(submitted) || publication.active}
            onBuild={startBuild}
          />
        </>
      ) : null}
      <GrowthMonthlyPublicationRecovery
        {...publication.recovery}
        busy={refreshing}
      />
    </section>
  );
}

export function GrowthMonthlyReportState({
  data,
  building,
  locked = false,
  onBuild,
}: {
  data: GrowthMonthlyReportDto;
  building: boolean;
  locked?: boolean;
  onBuild: () => void;
}) {
  if (data.state === "report") return <GrowthReportView data={data} />;
  const month = formatGrowthReportMonth(data.periodStart);
  if (data.state === "no_activity")
    return (
      <div className="mt-4 text-sm">
        <p>{data.message}</p>
        <p className="mt-2 text-base-content/70">
          Eligible saved{" "}
          <a href="#growth-work" className="link">
            Work
          </a>{" "}
          includes Actions completed during {month}, terminal Measurements
          evaluated during it, and active Actions selected for Risks,
          Opportunities or Next month. Refresh after saving that record.
        </p>
      </div>
    );
  return (
    <div className="mt-4 text-sm">
      <p>
        {month} is ready to summarise using {data.reportTimezone} calendar
        boundaries. Building creates version 1 once; it will not absorb later
        changes.
      </p>
      <button
        type="button"
        className="btn btn-primary btn-sm mt-4"
        disabled={building || locked}
        onClick={onBuild}
      >
        {building ? `Building ${month} summary…` : `Build ${month} summary`}
      </button>
    </div>
  );
}
