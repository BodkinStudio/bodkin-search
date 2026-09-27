import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useWorkspaceAccess } from "@/client/features/workspaces/useWorkspaceAccess";
import { getGrowthPlan } from "@/serverFunctions/growthPlan";
import type { GrowthPlanDto } from "@/types/schemas/growth-plan";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";
import {
  GROWTH_PLAN_IN_PROGRESS_STATUSES,
  GROWTH_PLAN_READY_STATUSES,
} from "./plan/GrowthPlanPresentation";
import { GrowthPlanStatusSelect } from "./plan/GrowthPlanStatusSelect";

const OPEN_STATUSES: readonly string[] = [
  ...GROWTH_PLAN_IN_PROGRESS_STATUSES,
  ...GROWTH_PLAN_READY_STATUSES,
];

// Every action written into the plan, as one list to work from: what is in
// flight first, then what is next by due date. Status changes here are the
// same transitions as on the plan itself.
export function GrowthPlanActionsTable({ projectId }: { projectId: string }) {
  const canEdit = useWorkspaceAccess().can("edit");
  const [showAll, setShowAll] = useState(false);
  const query = useQuery({
    queryKey: ["growthPlan", projectId],
    queryFn: (): Promise<GrowthPlanDto> =>
      getGrowthPlan({ data: { projectId } }),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const rows = (query.data?.workstreams ?? []).flatMap((workstream) =>
    workstream.actions.map((action) => ({ action, workstream })),
  );
  const open = rows.filter(({ action }) =>
    OPEN_STATUSES.includes(action.status),
  );
  const shown = (showAll ? rows : open).toSorted(
    (a, b) =>
      Number(GROWTH_PLAN_READY_STATUSES.includes(a.action.status)) -
        Number(GROWTH_PLAN_READY_STATUSES.includes(b.action.status)) ||
      a.action.dueOn.localeCompare(b.action.dueOn),
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section
      aria-labelledby="growth-plan-actions-title"
      className="rounded-lg border border-base-300 bg-base-100 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="growth-plan-actions-title" className="text-lg font-semibold">
            Plan actions
          </h2>
          <p className="mt-1 text-sm text-base-content/70">
            The work written into the plan.{" "}
            {query.data ? `${open.length} open of ${rows.length}.` : null}
          </p>
        </div>
        {rows.length > 0 ? (
          <div role="group" aria-label="Which actions" className="join">
            {(
              [
                [false, "Open"],
                [true, "All"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={showAll === value}
                className={`btn btn-sm join-item ${showAll === value ? "btn-neutral" : "btn-ghost border-base-300"}`}
                onClick={() => setShowAll(value)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {query.isPending ? (
        <div role="status" className="skeleton mt-4 h-24">
          <span className="sr-only">Loading plan actions</span>
        </div>
      ) : query.isError ? (
        <p role="alert" className="mt-4 text-sm">
          Plan actions could not be loaded.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-base-content/70">
          The plan has no actions yet.{" "}
          <Link
            to="/p/$projectId/growth"
            params={{ projectId }}
            className="link"
          >
            Open the plan
          </Link>
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-4 text-sm text-base-content/70">
          Nothing open. Every plan action has shipped or been cancelled.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Status</th>
                <th>Action</th>
                <th>Workstream</th>
                <th className="text-right">Due</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ action, workstream }) => {
                const overdue =
                  OPEN_STATUSES.includes(action.status) &&
                  action.dueOn.slice(0, 10) < today;
                return (
                  <tr key={action.id}>
                    <td className="w-0">
                      <GrowthPlanStatusSelect
                        projectId={projectId}
                        action={action}
                        canEdit={canEdit}
                      />
                    </td>
                    <td className="min-w-64 font-medium [overflow-wrap:anywhere]">
                      {action.title}
                    </td>
                    <td className="min-w-48 text-base-content/70">
                      <Link
                        to="/p/$projectId/growth"
                        params={{ projectId }}
                        hash={`growth-workstream-${workstream.id}`}
                        className="hover:underline"
                      >
                        {workstream.title}
                      </Link>
                    </td>
                    <td
                      className={`text-right whitespace-nowrap tabular-nums ${overdue ? "font-medium text-warning" : ""}`}
                    >
                      {overdue ? "Overdue · " : ""}
                      {formatGrowthPreviewDate(action.dueOn)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
