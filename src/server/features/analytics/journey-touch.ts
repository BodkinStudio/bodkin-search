import { channelFor } from "@/shared/analytics/channels";
import type { analyticsEvents } from "@/db/analytics.schema";

// A journey's first touch: what brought the visitor. Kept free of database
// and service imports so every report (qualified leads, traffic, journeys)
// can share it.

type Event = typeof analyticsEvents.$inferSelect;

/** The first touch of a journey: its first event that says where it came from, else its first event. */
export function firstTouch(history: Event[]) {
  const first = history[0];
  if (!first) return null;
  const sourced =
    history.find(
      (e) =>
        e.clickIdType ||
        e.campaignSource ||
        (e.referrerHost && e.referrerHost !== e.pageHost),
    ) ?? first;
  return {
    at: first.receivedAt,
    landingPage:
      history.find((e) => e.name === "page_view")?.pagePath ?? first.pagePath,
    channel: channelFor(sourced),
    source:
      sourced.campaignSource ??
      (sourced.referrerHost && sourced.referrerHost !== sourced.pageHost
        ? sourced.referrerHost
        : null),
    medium: sourced.campaignMedium,
    campaign: sourced.campaignName,
    content: sourced.campaignContent,
    term: sourced.campaignTerm,
    referrer: sourced.referrerHost
      ? `${sourced.referrerHost}${sourced.referrerPath ?? ""}`
      : null,
    clickIdType: sourced.clickIdType,
    // Internal: resolves an ad click to its campaign; never returned.
    clickId: sourced.clickId,
    sourcedAt: sourced.receivedAt,
  };
}
