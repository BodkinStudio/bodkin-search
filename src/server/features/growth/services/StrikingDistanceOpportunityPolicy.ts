import { sha256Hex } from "@/server/lib/audit/ids";

export const STRIKING_DISTANCE_OPPORTUNITY_POLICY_VERSION =
  "striking-distance-repeat-suppression-v1";

export async function strikingDistanceOpportunityDedupeKey(input: {
  projectId: string;
  query: string;
  canonicalUrl: string;
}) {
  return sha256Hex(
    JSON.stringify([
      input.projectId,
      "striking_distance_query",
      input.query.trim().replace(/\s+/g, " ").toLowerCase(),
      input.canonicalUrl,
    ]),
  );
}
