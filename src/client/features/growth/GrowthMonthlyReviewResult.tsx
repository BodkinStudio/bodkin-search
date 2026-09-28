import type { GrowthMonthlyReviewResponse } from "@/types/schemas/growth-monthly-review";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";

type InitialReview = Extract<GrowthMonthlyReviewResponse, { replayed: false }>;
type WarningCode = InitialReview["warnings"][number];
type RunStatus = GrowthMonthlyReviewResponse["run"]["status"];

const WARNING_COPY: Record<WarningCode, string> = {
  PRIORITY_PAGE_CHECK_PARTIAL:
    "Some source data was unavailable. Open the saved check to review the evidence that was saved.",
  PRIORITY_PAGE_CHECK_FAILED:
    "The priority-page check could not save a useful result. Open checks to review the setup before trying again.",
  PRIORITY_PAGE_CHECK_RUNNING:
    "The priority-page check is still marked running. Open it to inspect the saved status before retrying.",
  DUE_MEASUREMENTS_OVERFLOW:
    "More Measurements need review than can be shown here. Open Work to see the current list.",
  DUE_MEASUREMENTS_FAILED:
    "Growth could not read which Measurements need review. Open Work to check the saved items.",
  MONTHLY_REPORT_DRIFT:
    "The reporting month or timezone changed before the summary was prepared. Open Monthly summary and try again.",
  MONTHLY_REPORT_FAILED:
    "Growth could not prepare the monthly summary. Open Monthly summary to inspect its current state.",
};

const WARNING_PHASE: Record<WarningCode, "check" | "measurements" | "report"> =
  {
    PRIORITY_PAGE_CHECK_PARTIAL: "check",
    PRIORITY_PAGE_CHECK_FAILED: "check",
    PRIORITY_PAGE_CHECK_RUNNING: "check",
    DUE_MEASUREMENTS_OVERFLOW: "measurements",
    DUE_MEASUREMENTS_FAILED: "measurements",
    MONTHLY_REPORT_DRIFT: "report",
    MONTHLY_REPORT_FAILED: "report",
  };

const STATUS_LABELS: Record<RunStatus, string> = {
  running: "Running",
  completed: "Completed",
  completed_with_errors: "Needs attention",
  failed: "Failed",
};

function resultTone(status: RunStatus) {
  if (status === "failed") return "border-error/40 bg-error/5";
  if (status === "completed_with_errors")
    return "border-warning/50 bg-warning/5";
  return "border-base-300 bg-base-200/50";
}

function checkResult(result: InitialReview) {
  if (!result.check)
    return {
      value: "Unavailable",
      detail: "No saved priority-page check was returned.",
    };
  const status = result.check.run.status;
  if (status === "completed")
    return {
      value: "Completed",
      detail: result.check.replayed
        ? "The existing saved check was reused."
        : "A new priority-page check was saved.",
    };
  if (status === "completed_with_errors")
    return {
      value: "Needs attention",
      detail: "Useful check evidence was saved with incomplete source data.",
    };
  if (status === "running")
    return {
      value: "Still running",
      detail: "Later review steps were not started.",
    };
  return {
    value: "Failed",
    detail: "No useful priority-page result was produced.",
  };
}

function dueResult(result: InitialReview) {
  if (result.warnings.includes("PRIORITY_PAGE_CHECK_RUNNING"))
    return {
      value: "Not started",
      detail: "Waiting for the priority-page check to reach a final status.",
    };
  const due = result.dueMeasurements;
  if (!due)
    return {
      value: "Unavailable",
      detail: "The due-Measurement queue could not be read.",
    };
  if (due.scanState === "overflow")
    return {
      value: "Review required",
      detail: "More than the bounded queue can display.",
    };
  if (due.items.length === 0)
    return {
      value: "None due",
      detail: "No saved Measurement window is ready for review.",
    };
  return {
    value: `${due.items.length}${due.hasMore ? "+" : ""} due`,
    detail: "These Measurements still need human review.",
  };
}

function reportResult(result: InitialReview) {
  if (result.warnings.includes("PRIORITY_PAGE_CHECK_RUNNING"))
    return {
      value: "Not started",
      detail: "Waiting for the priority-page check to reach a final status.",
    };
  const report = result.report;
  if (!report)
    return {
      value: "Unavailable",
      detail: "No monthly summary result was returned.",
    };
  if (report.state === "no_activity")
    return {
      value: "No saved activity",
      detail: "Nothing eligible was available to freeze into this month.",
    };
  if (report.state === "ready")
    return {
      value: "Not built",
      detail: "The reporting coordinate changed before the build completed.",
    };
  return {
    value: report.report.status === "published" ? "Published" : "Draft ready",
    detail: "A frozen monthly summary is available below.",
  };
}

function ReviewPhase({
  label,
  value,
  detail,
  href,
  action,
  warnings,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
  action: string;
  warnings: string[];
  onClick?: () => void;
}) {
  return (
    <div className="flex min-h-36 flex-col rounded-lg border border-base-300 bg-base-100 p-4">
      <dt className="text-sm text-base-content/70">{label}</dt>
      <dd className="flex flex-1 flex-col">
        <span className="mt-1 text-lg font-semibold">{value}</span>
        <p className="mt-1 text-pretty text-xs text-base-content/70">
          {detail}
        </p>
        {warnings.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 border-l-2 border-warning/70 pl-5 text-xs text-base-content/80">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        <a
          href={href}
          className="link mt-auto pt-3 text-sm font-medium"
          onClick={onClick}
        >
          {action}
        </a>
      </dd>
    </div>
  );
}

export function GrowthMonthlyReviewResult({
  result,
  onOpenCheck,
}: {
  result: GrowthMonthlyReviewResponse;
  onOpenCheck: (runId: string) => void;
}) {
  const period = `${formatGrowthPreviewDate(result.run.periodStart)} – ${formatGrowthPreviewDate(result.run.periodEnd)}`;
  const running = result.run.status === "running";
  const warningCopy = result.replayed
    ? []
    : result.warnings.map((warning) => ({
        phase: WARNING_PHASE[warning],
        message: WARNING_COPY[warning],
      }));
  const title = running
    ? "Monthly review is still marked running"
    : result.run.status === "completed"
      ? "Monthly review prepared"
      : result.run.status === "completed_with_errors"
        ? "Monthly review prepared with attention needed"
        : "Monthly review did not complete";
  return (
    <div
      className={`mt-5 rounded-lg border p-4 ${resultTone(result.run.status)}`}
      role={result.run.status === "completed" ? "status" : "alert"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-base-content/70">
            {running
              ? "Growth does not promise background completion or infer that an interrupted review finished."
              : `Previous complete reporting month · ${period}`}
          </p>
        </div>
        <span className="badge badge-outline">
          {STATUS_LABELS[result.run.status]}
        </span>
      </div>

      {result.replayed ? (
        <p className="mt-4 text-sm">
          This is the authoritative saved review status. An exact replay does
          not reconstruct the individual phase results. Refresh the sections
          below to inspect any saved work.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 md:grid-cols-3">
            <ReviewPhase
              label="Priority-page check"
              {...checkResult(result)}
              href="#growth-live-check-title"
              action={result.check ? "Open saved check" : "Open checks"}
              warnings={warningCopy
                .filter(({ phase }) => phase === "check")
                .map(({ message }) => message)}
              onClick={() => {
                if (result.check) onOpenCheck(result.check.run.id);
              }}
            />
            <ReviewPhase
              label="Measurements due"
              {...dueResult(result)}
              href="#growth-work"
              action="Review Work"
              warnings={warningCopy
                .filter(({ phase }) => phase === "measurements")
                .map(({ message }) => message)}
            />
            <ReviewPhase
              label="Monthly summary"
              {...reportResult(result)}
              href="#growth-monthly-summary"
              action="Open monthly summary"
              warnings={warningCopy
                .filter(({ phase }) => phase === "report")
                .map(({ message }) => message)}
            />
          </dl>
          <p className="mt-4 text-xs text-base-content/70">
            Measurements shown here are due for review now. The list may change
            as time passes, and this review does not evaluate them for you.
          </p>
        </>
      )}
    </div>
  );
}
