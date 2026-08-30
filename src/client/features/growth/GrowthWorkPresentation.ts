import {
  GROWTH_ACTION_STATUSES,
  isDirectGrowthActionTransition,
  type GrowthActionStatus,
} from "@/types/schemas/growth-actions";

export const GROWTH_WORK_STATUS_LABELS: Record<GrowthActionStatus, string> = {
  approved: "Approved",
  ready: "Ready",
  in_progress: "In progress",
  blocked: "Blocked",
  implemented: "Implemented",
  measuring: "Measuring",
  evaluated: "Evaluated",
  cancelled: "Cancelled",
};

export function growthWorkNextStatuses(status: GrowthActionStatus) {
  return GROWTH_ACTION_STATUSES.filter((next) =>
    isDirectGrowthActionTransition(status, next),
  );
}

export function formatGrowthWorkTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
