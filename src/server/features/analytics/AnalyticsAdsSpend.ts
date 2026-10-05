import { calendarDay } from "@/shared/analytics/calendar";
import { GoogleAdsService } from "@/server/features/google-ads/GoogleAdsService";
import { attributeSpend, type SpendLead } from "@/shared/analytics/ad-spend";

// Google Ads spend beside qualified leads: what each campaign cost in the
// period and its cost per qualified lead (CAC at MQL stage). A lead belongs
// to a campaign by its Google click id (resolved through click_view), else by
// its first touch's UTM campaign matching the campaign's name or id.

const MAX_CLICK_LOOKUPS = 60;

/**
 * Spend for the report's period from the project's connected Google Ads
 * account, attributed to its leads. Never throws: a missing connection or an
 * API problem comes back as state the report can show.
 */
export async function adsSpendForReport(
  projectId: string,
  window: { from: string; to: string },
  leads: {
    outcomeId: string;
    kind: SpendLead["kind"];
    utmCampaign: string | null;
    gclid: string | null;
    clickAt: string | null;
  }[],
) {
  const ads = await GoogleAdsService.clientFor(projectId).catch(() => null);
  if (!ads) return { connected: false as const };
  const tz = ads.connection.timeZone || "UTC";
  try {
    const campaigns = await ads.client.campaignSpend(
      ads.account,
      calendarDay(window.from, tz),
      calendarDay(window.to, tz),
    );
    const resolved = new Map<
      string,
      {
        campaignId: string;
        campaignName: string;
        adGroupName: string | null;
        keyword: string | null;
      }
    >();
    for (const lead of leads
      .filter((l) => l.gclid && l.clickAt)
      .slice(0, MAX_CLICK_LOOKUPS)) {
      const click = await ads.client
        .clickCampaign(ads.account, lead.gclid!, calendarDay(lead.clickAt!, tz))
        .catch(() => null);
      if (click) resolved.set(lead.outcomeId, click);
    }
    const summary = attributeSpend(
      campaigns,
      leads.map((l) => ({
        kind: l.kind,
        utmCampaign: l.utmCampaign,
        adCampaignId: resolved.get(l.outcomeId)?.campaignId ?? null,
      })),
    );
    return {
      connected: true as const,
      account: ads.connection.customerName,
      currency: ads.connection.currencyCode,
      ...summary,
      clicksByLead: Object.fromEntries(resolved),
      error: null,
    };
  } catch (error) {
    return {
      connected: true as const,
      account: ads.connection.customerName,
      currency: ads.connection.currencyCode,
      error:
        error instanceof Error
          ? error.message
          : "Google Ads could not be read.",
    };
  }
}
