import { sha256Hex } from "@/server/lib/audit/ids";
export const HIGH_IMPRESSION_LOW_CTR_OPPORTUNITY_POLICY_VERSION =
  "high-impression-low-ctr-repeat-suppression-v1";
export function highImpressionLowCtrOpportunityDedupeKey(input: {
  projectId: string;
  query: string;
  canonicalUrl: string;
}) {
  return sha256Hex(
    JSON.stringify([
      input.projectId,
      "high_impression_low_ctr_query",
      input.query.trim().replace(/\s+/g, " ").toLowerCase(),
      input.canonicalUrl,
    ]),
  );
}
