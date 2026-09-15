import { sha256Hex } from "@/server/lib/audit/ids";

export const PERSISTENT_RANK_DROP_OPPORTUNITY_POLICY_VERSION =
  "persistent-rank-drop-repeat-suppression-v1";

export async function persistentRankDropOpportunityDedupeKey(input: {
  projectId: string;
  configId: string;
  trackingKeywordId: string;
  device: "desktop" | "mobile";
  canonicalUrl: string;
}) {
  return sha256Hex(
    JSON.stringify([
      input.projectId,
      "persistent_tracked_rank_drop",
      input.configId,
      input.trackingKeywordId,
      input.device,
      input.canonicalUrl,
    ]),
  );
}
