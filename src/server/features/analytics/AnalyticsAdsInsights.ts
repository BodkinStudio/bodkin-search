import { calendarDay } from "@/shared/analytics/calendar";
import {
  judgeSearchTerms,
  NO_RESULT_MIN_CLICKS,
  summariseAssets,
} from "@/shared/analytics/ads-insights";
import type { AnalyticsQuery } from "@/types/schemas/analytics";
import { GoogleAdsService } from "@/server/features/google-ads/GoogleAdsService";
import { trafficReport } from "./AnalyticsTraffic";

// The learning read of Google Ads (self-learning ads loop, phase 1), read
// only: what people searched before clicking a search ad, judged against what
// that keyword's visitors did on the site, and Google's rating of each
// headline and description. Performance Max does not report individual
// search terms here, so terms come from Search campaigns.

const failure = (r: PromiseSettledResult<unknown>) =>
  r.status === "rejected"
    ? r.reason instanceof Error
      ? r.reason.message
      : "Google Ads could not be read."
    : null;

export async function adsInsightsReport(q: AnalyticsQuery) {
  const ads = await GoogleAdsService.clientFor(q.projectId).catch(() => null);
  if (!ads) return { connected: false as const };
  const traffic = await trafficReport(q, { keywordLimit: 1000 });
  const tz = ads.connection.timeZone || "UTC";
  const from = calendarDay(traffic.window.from, tz);
  const to = calendarDay(traffic.window.to, tz);
  const byKeyword = new Map(
    traffic.byKeyword.map((k) => [
      k.label.trim().toLowerCase(),
      { visitors: k.visitors, signedUp: k.signedUp, leads: k.leads },
    ]),
  );
  // Each read stands alone: one failing never hides the other.
  const [terms, assets] = await Promise.allSettled([
    ads.client.searchTerms(ads.account, from, to),
    ads.client.assetRatings(ads.account, from, to),
  ]);
  const searchTerms =
    terms.status === "fulfilled"
      ? judgeSearchTerms(terms.value, byKeyword)
      : [];
  const ratedAssets =
    assets.status === "fulfilled" ? summariseAssets(assets.value) : [];
  return {
    connected: true as const,
    account: ads.connection.customerName,
    currency: ads.connection.currencyCode,
    searchTerms: {
      promising: searchTerms
        .filter((t) => t.verdict === "promising")
        .slice(0, 25),
      spendingNoResult: searchTerms
        .filter((t) => t.verdict === "spending_no_result")
        .slice(0, 25),
      top: searchTerms.slice(0, 50),
      total: searchTerms.length,
      error: failure(terms),
    },
    assets: {
      best: ratedAssets.filter((a) => a.rating === "Best"),
      low: ratedAssets.filter((a) => a.low),
      all: ratedAssets.slice(0, 60),
      error: failure(assets),
    },
    definitions: {
      searchTerms:
        "What people typed before clicking a Search campaign ad (Performance Max does not report individual searches here), biggest spend first.",
      promising:
        "Google counted a conversion, or the keyword it matched brought visitors who signed up or became qualified leads on the site.",
      spendingNoResult: `At least ${NO_RESULT_MIN_CLICKS} clicks with no conversion, no sign-up and no qualified lead on its keyword: a candidate negative keyword or a landing page to fix. Not yet a verdict at low volume.`,
      siteResults:
        "Site results are per keyword (from the ad's keyword tag), shared by every search that matched it.",
      assets:
        "Google's rating of each responsive search ad headline and description against the others in its ad: Best, Good, Low, or Learning while it gathers data. Best rating across ad groups shown; low means rated Low somewhere.",
    },
    window: traffic.window,
  };
}
