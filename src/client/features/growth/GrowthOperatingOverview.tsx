import { useQuery } from "@tanstack/react-query";
import { getGrowthOperatingOverview } from "@/serverFunctions/growthOperatingOverview";
import {
  GROWTH_OVERVIEW_ACTIVE_ACTION_STATUSES,
  type GrowthOperatingOverviewDto,
} from "@/types/schemas/growth-operating-overview";
import { formatGrowthReportMonth } from "./GrowthReportPresentation";
import { GROWTH_WORK_STATUS_LABELS } from "./GrowthWorkPresentation";

export function boundedOverviewCount(count: number, hasMore: boolean) {
  return `${count}${hasMore ? "+" : ""}`;
}

export function monthlyOverviewLabel(
  monthly: GrowthOperatingOverviewDto["monthlySummary"],
) {
  if (monthly.state === "published") return "Published";
  if (monthly.state === "draft") return "Draft ready";
  if (monthly.state === "no_activity") return "No saved activity";
  return "Ready to build";
}

function activeWorkDetail(data: GrowthOperatingOverviewDto) {
  const active = GROWTH_OVERVIEW_ACTIVE_ACTION_STATUSES.filter(
    (status) => data.activeWork.byStatus[status] > 0,
  );
  if (active.length === 0) return "No active investigations";
  return active
    .map(
      (status) =>
        `${data.activeWork.byStatus[status]} ${GROWTH_WORK_STATUS_LABELS[status].toLowerCase()}`,
    )
    .join(" · ");
}

function resultDetail(data: GrowthOperatingOverviewDto) {
  const positive =
    data.evaluatedMeasurements.byOutcome.strong_positive +
    data.evaluatedMeasurements.byOutcome.positive;
  const negative =
    data.evaluatedMeasurements.byOutcome.strong_negative +
    data.evaluatedMeasurements.byOutcome.negative;
  const sourceLimit = data.evaluatedMeasurements.sourceHasMore
    ? " · More completed plans saved"
    : "";
  if (data.evaluatedMeasurements.count === 0)
    return `${
      data.evaluatedMeasurements.inconsistentCount
        ? `${data.evaluatedMeasurements.inconsistentCount} saved result needs review`
        : "No reviewed outcomes"
    }${sourceLimit}`;
  const integrity = data.evaluatedMeasurements.inconsistentCount
    ? ` · ${data.evaluatedMeasurements.inconsistentCount} needs review`
    : "";
  return `${positive} positive · ${negative} negative${integrity}${sourceLimit}`;
}

export function GrowthOperatingOverview({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["growthOperatingOverview", projectId],
    queryFn: () => getGrowthOperatingOverview({ data: { projectId } }),
    retry: false,
  });

  return (
    <section
      id="growth-overview"
      aria-labelledby="growth-overview-title"
      className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="growth-overview-title"
            className="text-balance text-lg font-semibold"
          >
            Growth at a glance
          </h2>
          <p className="mt-1 max-w-prose text-pretty text-sm text-base-content/70">
            Current saved work across the Growth loop. Counts ending in + are
            bounded lists, not exact totals.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Refreshing…" : "Refresh overview"}
        </button>
      </div>

      {query.isPending ? (
        <div
          role="status"
          aria-busy="true"
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="min-h-28 rounded-lg border border-base-300 bg-base-200 p-4"
            />
          ))}
          <span className="sr-only">Loading Growth overview…</span>
        </div>
      ) : null}

      {query.isError ? (
        <div role="alert" className="alert alert-error mt-4 flex-wrap">
          <p className="flex-1">The Growth overview could not be loaded.</p>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void query.refetch()}
          >
            Retry overview
          </button>
        </div>
      ) : null}

      {query.data ? <GrowthOperatingOverviewMetrics data={query.data} /> : null}
    </section>
  );
}

export function GrowthOperatingOverviewMetrics({
  data,
}: {
  data: GrowthOperatingOverviewDto;
}) {
  const due =
    data.dueMeasurements.count === null
      ? "Review"
      : boundedOverviewCount(
          data.dueMeasurements.count,
          data.dueMeasurements.hasMore,
        );
  const metrics = [
    {
      label: "Opportunities",
      value: boundedOverviewCount(
        data.opportunities.count,
        data.opportunities.hasMore,
      ),
      detail: "Awaiting review or action",
      href: "#growth-opportunities",
      action: "Review opportunities",
    },
    {
      label: "Active work",
      value: boundedOverviewCount(
        data.activeWork.count,
        data.activeWork.hasMore,
      ),
      detail: activeWorkDetail(data),
      href: "#growth-work",
      action: "Open work",
    },
    {
      label: "Measurement due",
      value: due,
      detail:
        data.dueMeasurements.count === null
          ? "The saved-plan scan needs attention"
          : "Windows ready for review",
      href: "#growth-work",
      action: "Review measurements",
    },
    {
      label: "Evaluated",
      value: String(data.evaluatedMeasurements.count),
      detail: resultDetail(data),
      href: "#growth-work",
      action: "View outcomes",
    },
    {
      label: formatGrowthReportMonth(data.monthlySummary.periodStart),
      value: monthlyOverviewLabel(data.monthlySummary),
      detail: "Monthly summary",
      href: "#growth-monthly-summary",
      action: "Open summary",
    },
  ];

  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="flex min-h-28 flex-col rounded-lg border border-base-300 p-4"
        >
          <dt className="text-sm text-base-content/70">{metric.label}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">
            {metric.value}
          </dd>
          <p className="mt-1 text-pretty text-xs text-base-content/70">
            {metric.detail}
          </p>
          <a
            className="link mt-auto pt-3 text-sm font-medium"
            href={metric.href}
          >
            {metric.action}
          </a>
        </div>
      ))}
    </dl>
  );
}
