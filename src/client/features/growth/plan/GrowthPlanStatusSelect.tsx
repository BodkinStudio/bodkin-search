import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { transitionGrowthPlanAction } from "@/serverFunctions/growthPlan";
import type { GrowthActionStatus } from "@/types/schemas/growth-actions";
import type { GrowthPlanActionDto } from "@/types/schemas/growth-plan";
import {
  GROWTH_WORK_STATUS_LABELS,
  growthWorkNextStatuses,
} from "../GrowthWorkPresentation";
import { GROWTH_PLAN_STATUS_BADGES } from "./GrowthPlanPresentation";

// A plan action's status as one control: the current status, then the moves
// the lifecycle allows. Picking one saves it. Read-only readers (or a status
// with nowhere to go) see the badge instead.
export function GrowthPlanStatusSelect({
  projectId,
  action,
  canEdit,
}: {
  projectId: string;
  action: GrowthPlanActionDto;
  canEdit: boolean;
}) {
  const client = useQueryClient();
  const badge = GROWTH_PLAN_STATUS_BADGES[action.status];
  const nextStatuses = canEdit ? growthWorkNextStatuses(action.status) : [];
  const change = useMutation({
    mutationKey: ["growthPlanActionStatus", projectId, action.id],
    mutationFn: (status: GrowthActionStatus) =>
      transitionGrowthPlanAction({
        data: {
          projectId,
          actionId: action.id,
          expectedStatus: action.status,
          expectedVersion: action.stateVersion,
          status,
        },
      }),
    retry: false,
    // Shipping starts a measurement, which the This week panel lists.
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["growthPlan", projectId] }),
        client.invalidateQueries({
          queryKey: ["growthAnalystDigest", projectId],
        }),
      ]),
  });

  if (nextStatuses.length === 0)
    return (
      <span className={`badge w-28 justify-center ${badge.className}`}>
        {badge.label}
      </span>
    );
  return (
    <span className="inline-flex flex-col gap-1">
      <select
        className="select select-sm w-auto"
        aria-label={`Status of ${action.title}`}
        value={action.status}
        disabled={change.isPending}
        onChange={(event) => {
          const next = nextStatuses.find(
            (status) => status === event.target.value,
          );
          if (next) change.mutate(next);
        }}
      >
        <option value={action.status}>{badge.label}</option>
        {nextStatuses.map((status) => (
          <option key={status} value={status}>
            Move to {GROWTH_WORK_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      {change.error ? (
        <span role="alert" className="text-xs text-error">
          {getStandardErrorMessage(change.error, "The status was not saved.")}
        </span>
      ) : null}
    </span>
  );
}
