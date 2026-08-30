import { useQuery } from "@tanstack/react-query";
import { getGrowthWork } from "@/serverFunctions/growthInvestigations";
import type { GrowthActionStatus } from "@/types/schemas/growth-actions";
import type { GrowthWorkOverview } from "@/types/schemas/growth-investigations";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";

const STATUS_LABELS: Record<GrowthActionStatus, string> = {
  approved: "Approved",
  ready: "Ready",
  in_progress: "In progress",
  blocked: "Blocked",
  implemented: "Implemented",
  measuring: "Measuring",
  evaluated: "Evaluated",
  cancelled: "Cancelled",
};

export function GrowthWork({
  projectId,
  onOpenCheck,
}: {
  projectId: string;
  onOpenCheck: (runId: string) => void;
}) {
  const query = useQuery({
    queryKey: ["growthWork", projectId],
    queryFn: () => getGrowthWork({ data: { projectId } }),
    retry: false,
  });
  return (
    <section
      id="growth-work"
      aria-labelledby="growth-work-title"
      className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="growth-work-title" className="text-lg font-semibold">
            Work
          </h2>
          <p className="mt-1 max-w-prose text-sm text-base-content/70">
            Investigations you have approved from saved checks. Approval plans
            the work; it does not mean the website has changed.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh saved work
        </button>
      </div>
      {query.isPending ? (
        <p role="status" aria-busy="true" className="mt-4 text-sm">
          Loading saved work…
        </p>
      ) : null}
      {query.isError ? (
        <p
          role="alert"
          className="mt-4 text-sm text-[color:color-mix(in_oklch,var(--color-error),var(--color-base-content)_35%)]"
        >
          Saved work could not be loaded. Use Refresh saved work to try again.
        </p>
      ) : null}
      {query.data ? (
        <GrowthWorkList data={query.data} onOpenCheck={onOpenCheck} />
      ) : null}
    </section>
  );
}

export function GrowthWorkList({
  data,
  onOpenCheck,
}: {
  data: GrowthWorkOverview;
  onOpenCheck: (runId: string) => void;
}) {
  if (data.actions.length === 0)
    return (
      <p className="mt-4 text-sm text-base-content/70">
        No investigations approved yet. Open a decline from a new saved check,
        review its investigation and choose a due date.
      </p>
    );
  return (
    <div className="mt-4">
      <p className="text-xs text-base-content/70">
        Up to {data.limit} most recently added investigations.
      </p>
      <ul className="mt-3 space-y-4">
        {data.actions.map((action) => (
          <li
            key={action.id}
            className="border-t border-base-300 pt-4 text-sm [overflow-wrap:anywhere]"
          >
            <h3 className="font-semibold">{action.title}</h3>
            <ul className="mt-1 space-y-1 text-base-content/70">
              {action.displayUrls.map((url, index) => (
                <li key={`${index}:${url}`}>
                  {url ?? "Saved page URL withheld"}
                </li>
              ))}
            </ul>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              <div>
                <dt className="text-xs text-base-content/70">Status</dt>
                <dd className="font-medium">{STATUS_LABELS[action.status]}</dd>
              </div>
              <div>
                <dt className="text-xs text-base-content/70">Due date (UTC)</dt>
                <dd className="font-medium tabular-nums">
                  {action.dueOn
                    ? formatGrowthPreviewDate(action.dueOn)
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-base-content/70">Added (UTC)</dt>
                <dd className="tabular-nums">
                  {formatGrowthPreviewDate(action.createdAt.slice(0, 10))}
                </dd>
              </div>
            </dl>
            <a
              href="#growth-live-check-title"
              className="link mt-3 inline-block font-medium"
              onClick={() => onOpenCheck(action.runId)}
            >
              Open source check
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
