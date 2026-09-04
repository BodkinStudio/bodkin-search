import { sha256Hex } from "@/server/lib/audit/ids";

export const NEW_CRITICAL_AUDIT_ISSUE_OPPORTUNITY_POLICY_VERSION =
  "new-critical-audit-issue-repeat-suppression-v1";

export async function newCriticalAuditIssueOpportunityDedupeKey(input: {
  projectId: string;
  stableIssueKey: string;
}) {
  return sha256Hex(
    JSON.stringify([
      input.projectId,
      "new_critical_audit_issue",
      input.stableIssueKey,
    ]),
  );
}
