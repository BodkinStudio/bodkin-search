import { useQuery } from "@tanstack/react-query";
import { getGrowthChangeLog } from "@/serverFunctions/growthChangeLog";
import type {
  GrowthPlanActionDto,
  GrowthWorkstreamDto,
} from "@/types/schemas/growth-plan";
import { GROWTH_CHANGE_LABELS } from "../GrowthChangePresentation";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import {
  CARD,
  EYEBROW,
  GROWTH_PLAN_IN_PROGRESS_STATUSES,
  GROWTH_PLAN_READY_STATUSES,
  GROWTH_PLAN_SHIPPED_STATUSES,
  GROWTH_PLAN_STATUS_BADGES,
} from "./GrowthPlanPresentation";

const NEXT_LIMIT = 5;
const RECENT_LIMIT = 3;

// Where the plan stands today: how much of the work has moved, what is being
// worked on, what comes next, and the last few changes that were made.
export function GrowthPlanStatus({
  projectId,
  workstreams,
}: {
  projectId: string;
  workstreams: GrowthWorkstreamDto[];
}) {
  const entries = workstreams.flatMap((workstream) =>
    workstream.actions.map((action) => ({ action, workstream })),
  );
  if (entries.length === 0) return null;
  const count = (statuses: readonly string[]) =>
    entries.filter(({ action }) => statuses.includes(action.status)).length;
  const shipped = count(GROWTH_PLAN_SHIPPED_STATUSES);
  const inProgress = count(GROWTH_PLAN_IN_PROGRESS_STATUSES);
  const notStarted = count(GROWTH_PLAN_READY_STATUSES);
  const open = entries
    .filter(
      ({ action }) =>
        GROWTH_PLAN_IN_PROGRESS_STATUSES.includes(action.status) ||
        GROWTH_PLAN_READY_STATUSES.includes(action.status),
    )
    .toSorted(
      (a, b) =>
        Number(GROWTH_PLAN_READY_STATUSES.includes(a.action.status)) -
          Number(GROWTH_PLAN_READY_STATUSES.includes(b.action.status)) ||
        a.action.dueOn.localeCompare(b.action.dueOn),
    )
    .slice(0, NEXT_LIMIT);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={EYEBROW}>Where the work is</h2>
          <p className="text-sm tabular-nums text-base-content/70">
            {shipped} of {entries.length} shipped
          </p>
        </div>
        <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-base-200">
          <Segment
            count={shipped}
            total={entries.length}
            className="bg-success"
          />
          <Segment
            count={inProgress}
            total={entries.length}
            className="bg-primary"
          />
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/70">
          <Legend className="bg-success" label={`${shipped} shipped`} />
          <Legend className="bg-primary" label={`${inProgress} in progress`} />
          <Legend className="bg-base-300" label={`${notStarted} not started`} />
        </ul>
        {open.length > 0 ? (
          <>
            <h3 className={`${EYEBROW} mt-5`}>Now and next</h3>
            <ul className="mt-2 divide-y divide-base-300">
              {open.map(({ action, workstream }) => (
                <NextRow
                  key={action.id}
                  action={action}
                  workstream={workstream}
                  overdue={action.dueOn.slice(0, 10) < today}
                />
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-4 text-sm text-base-content/70">
            Everything in the plan has shipped.
          </p>
        )}
      </div>
      <GrowthPlanRecentChanges projectId={projectId} />
    </section>
  );
}

function NextRow({
  action,
  workstream,
  overdue,
}: {
  action: GrowthPlanActionDto;
  workstream: GrowthWorkstreamDto;
  overdue: boolean;
}) {
  const badge = GROWTH_PLAN_STATUS_BADGES[action.status];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={`badge badge-sm mt-0.5 w-24 shrink-0 justify-center ${badge.className}`}
      >
        {badge.label}
      </span>
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <a
          href={`#growth-workstream-${workstream.id}`}
          className="font-medium hover:underline"
        >
          {action.title}
        </a>
        <p className="text-xs text-base-content/60">
          {workstream.title} ·{" "}
          <span className={overdue ? "font-medium text-warning" : undefined}>
            {overdue ? "Overdue, was due" : "Due"}{" "}
            {formatGrowthPreviewDate(action.dueOn)}
          </span>
        </p>
      </div>
    </li>
  );
}

function GrowthPlanRecentChanges({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["growthChangeLog", projectId],
    queryFn: () => getGrowthChangeLog({ data: { projectId } }),
    retry: false,
  });
  const changes = query.data?.changes.slice(0, RECENT_LIMIT) ?? [];
  return (
    <div className={`${CARD} p-5`}>
      <h2 className={EYEBROW}>Recent changes</h2>
      {query.isPending ? (
        <p role="status" className="mt-3 text-sm text-base-content/60">
          Loading…
        </p>
      ) : query.isError ? (
        <p role="alert" className="mt-3 text-sm">
          Recent changes could not be loaded.
        </p>
      ) : changes.length === 0 ? (
        <p className="mt-3 text-sm text-base-content/70">
          No changes recorded yet. Changes to the site appear here as they are
          logged.
        </p>
      ) : (
        <>
          <ol className="mt-2 divide-y divide-base-300">
            {changes.map((change) => (
              <li key={change.id} className="py-2.5 text-sm">
                <p className="text-xs text-base-content/60">
                  {GROWTH_CHANGE_LABELS[change.changeType]} ·{" "}
                  {formatGrowthPreviewDate(change.happenedAt)}
                </p>
                <p className="mt-0.5 line-clamp-2 [overflow-wrap:anywhere]">
                  {change.description}
                </p>
              </li>
            ))}
          </ol>
          <a
            href="#growth-plan-ledger"
            className="link mt-2 inline-block text-sm"
          >
            See the full change log
          </a>
        </>
      )}
    </div>
  );
}

function Segment({
  count,
  total,
  className,
}: {
  count: number;
  total: number;
  className: string;
}) {
  if (count === 0 || total === 0) return null;
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ width: `${(count / total) * 100}%` }}
    />
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-2.5 rounded-sm ${className}`} />
      {label}
    </li>
  );
}
