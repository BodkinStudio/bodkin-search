import { sha256Hex } from "@/server/lib/audit/ids";
import type { GrowthInvestigationSuppressionReason } from "@/types/schemas/growth-investigations";

export const PRIORITY_PAGE_OPPORTUNITY_POLICY_VERSION =
  "priority-page-repeat-suppression-v1";

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
