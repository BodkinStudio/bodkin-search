import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import {
  estimateRankCheckCredits,
  estimateScheduledRankCheckCredits,
  isScheduledRankTrackingInterval,
} from "@/shared/rank-tracking";

export function SavedKeywordsTrackingCost({
  config,
  keywordCount,
}: {
  config: Pick<
    RankTrackingConfig,
    "devices" | "serpDepth" | "scheduleInterval" | "isActive"
  > & { keywordCount: number };
  keywordCount: number;
}) {
  const { costUsd, costCredits } = estimateRankCheckCredits(
    keywordCount,
    config.devices,
    config.serpDepth,
    "live",
  );
  const scheduled = isScheduledRankTrackingInterval(config.scheduleInterval)
    ? estimateScheduledRankCheckCredits(
        config.keywordCount + keywordCount,
        config.devices,
        config.serpDepth,
        config.scheduleInterval,
      )
    : null;
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
      <p className="font-medium">Confirmation can use credits</p>
      <p className="mt-1 text-base-content/80">
        Adding new keywords automatically attempts an initial rank check: about
        ${costUsd.toFixed(2)} ({costCredits} credits) for {keywordCount} keyword
        {keywordCount !== 1 ? "s" : ""} at this destination.
      </p>
      {scheduled ? (
        <p className="mt-2 text-base-content/80">
          Schedule: {config.scheduleInterval}
          {config.isActive ? "" : " (currently paused)"}. With all selected
          terms added, the full configuration would track{" "}
          {config.keywordCount + keywordCount} keywords: about $
          {scheduled.costUsd.toFixed(4)} ({scheduled.costCredits} credits) per
          scheduled check, or ${scheduled.monthlyCostUsd.toFixed(2)} (
          {scheduled.monthlyCostCredits} credits) per month. This queued
          estimate assumes every selected term is new. Rejected, failed or
          timed-out queued checks can fall back to live checks and use
          additional credits.
        </p>
      ) : (
        <p className="mt-2 text-base-content/80">
          Schedule: manual. No recurring checks are scheduled.
        </p>
      )}
      <p className="mt-1 text-base-content/70">
        The automatic metrics refresh can also use credits. Its cost is not
        included in this SERP-check estimate. Existing tracked terms may not be
        added or checked again.
      </p>
    </div>
  );
}
