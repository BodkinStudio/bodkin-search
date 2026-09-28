import { sha256Hex } from "@/server/lib/audit/ids";
import type { GrowthInvestigationSuppressionReason } from "@/types/schemas/growth-investigations";

export const PRIORITY_PAGE_OPPORTUNITY_POLICY_VERSION =
  "priority-page-repeat-suppression-v2";

export function priorityPageControllerCycleKey(
  priorControllerRecommendationId: string | null,
) {
  return priorControllerRecommendationId ?? "initial-controller";
}

/**
 * A new captured Signal may open the next cycle only when both stored values
 * are valid instants and the Signal is strictly later than evaluation.
 */
export function isPriorityPageControllerReleasable(input: {
  capturedAt: string;
  evaluatedAt: string | null;
  actionStatus: string | null;
}) {
  if (input.actionStatus !== "evaluated" || !input.evaluatedAt) return false;
  const capturedAt = new Date(input.capturedAt);
  const evaluatedAt = new Date(input.evaluatedAt);
  if (Number.isNaN(capturedAt.getTime()) || Number.isNaN(evaluatedAt.getTime()))
    return false;
  return capturedAt.getTime() > evaluatedAt.getTime();
}

const priorityPageOpportunityCoordinate = (input: {
  projectId: string;
  keyPageId: string;
}) =>
  [
    input.projectId,
    "priority_page_click_decline",
    "key_page",
    input.keyPageId,
    "gsc_clicks",
  ] as const;

export async function priorityPageOpportunityDedupeKey(input: {
  projectId: string;
  keyPageId: string;
}) {
  return sha256Hex(JSON.stringify(priorityPageOpportunityCoordinate(input)));
}

export function priorityPageSuppressionReason(input: {
  recommendationStatus:
    | "proposed"
    | "accepted"
    | "dismissed"
    | "snoozed"
    | "merged"
    | "superseded";
  hasTemplateAction: boolean;
}): GrowthInvestigationSuppressionReason {
  if (input.recommendationStatus === "accepted") {
    return input.hasTemplateAction
      ? "existing_action"
      : "accepted_without_action";
  }
  if (input.recommendationStatus === "snoozed") return "existing_snooze";
  if (input.recommendationStatus === "dismissed") return "prior_dismissal";
  if (
    input.recommendationStatus === "merged" ||
    input.recommendationStatus === "superseded"
  )
    return "resolved_recommendation";
  return "existing_proposal";
}
