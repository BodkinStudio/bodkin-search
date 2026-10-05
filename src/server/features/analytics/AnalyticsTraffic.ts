import { calendarDay } from "@/shared/analytics/calendar";
import { analyticsChannels } from "@/shared/analytics/channels";
import type { AnalyticsQuery } from "@/types/schemas/analytics";
import { GoogleAdsService } from "@/server/features/google-ads/GoogleAdsService";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
import { firstTouch } from "./journey-touch";

// Where visitors come from and what they do next: every visitor in the
// period by the channel of their first touch (paid search, organic search,
// AI answer, social, email, referral, direct), and every ad visitor by the
// campaign and keyword that brought them, with where they landed, how far
// they read, which calls to action they clicked and whether they became a
// qualified lead. Ad campaigns carry their Google Ads name and spend when an
// Ads account is connected.

const ACTIONS = ["start_trial", "book_demo", "contact"] as const;
type Action = (typeof ACTIONS)[number];
const PAID = new Set(["Paid search", "Paid social"]);
const isAction = (value: string | null): value is Action =>
  ACTIONS.some((a) => a === value);

type Visitor = {
  contextId: string;
  channel: string;
  campaign: string | null;
  term: string | null;
  clickIdType: string | null;
  landing: string | null;
  pages: number;
  actions: Set<Action>;
  signedUp: boolean;
  lead: boolean;
};

type Row = {
  label: string;
  visitors: number;
  pagesPerVisitor: number;
  clicked: Record<Action, number>;
  signedUp: number;
  leads: number;
  topLandings: { path: string; visitors: number }[];
};

function summarise(label: string, visitors: Visitor[]): Row {
  const landings = new Map<string, number>();
  for (const v of visitors)
    if (v.landing) landings.set(v.landing, (landings.get(v.landing) ?? 0) + 1);
  const total = visitors.reduce((sum, v) => sum + v.pages, 0);
  return {
    label,
    visitors: visitors.length,
    pagesPerVisitor: visitors.length
      ? Math.round((total / visitors.length) * 10) / 10
      : 0,
    clicked: {
      start_trial: visitors.filter((v) => v.actions.has("start_trial")).length,
      book_demo: visitors.filter((v) => v.actions.has("book_demo")).length,
      contact: visitors.filter((v) => v.actions.has("contact")).length,
    },
    signedUp: visitors.filter((v) => v.signedUp).length,
    leads: visitors.filter((v) => v.lead).length,
    topLandings: [...landings]
      .map(([path, count]) => ({ path, visitors: count }))
      .toSorted((a, b) => b.visitors - a.visitors)
      .slice(0, 3),
  };
}

const groupBy = <T>(items: T[], key: (item: T) => string | null) => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k) groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
};

export async function trafficReport(q: AnalyticsQuery) {
  const window = repo.windowFor(q);
  const [events, outcomes] = await Promise.all([
    repo.events(q),
    repo.outcomes(q),
  ]);
  const mqls = outcomes.filter((o) => o.name === "lead_qualified");
  // A visitor became a lead when an MQL names them, or names the customer
  // they were identified as.
  const leadContexts = new Set(
    mqls.flatMap((o) => (o.contextId ? [o.contextId] : [])),
  );
  const contexts = await repo.customerContexts(q.projectId, q.environment, [
    ...new Set(mqls.map((o) => o.customerId)),
  ]);
  for (const c of contexts) leadContexts.add(c.id);

  const visitors: Visitor[] = [...groupBy(events, (e) => e.contextId)].map(
    ([contextId, history]) => {
      const touch = firstTouch(history);
      return {
        contextId,
        channel: touch?.channel ?? "Direct",
        campaign: touch?.campaign ?? null,
        term: touch?.term ?? null,
        clickIdType: touch?.clickIdType ?? null,
        landing: touch?.landingPage ?? null,
        pages: history.filter((e) => e.name === "page_view").length,
        actions: new Set(
          history.flatMap((e) =>
            e.name === "acquisition_clicked" && isAction(e.action)
              ? [e.action]
              : [],
          ),
        ),
        // Identified: gave a work email on the trial page, or booked a demo.
        signedUp: history.some((e) => e.name === "identity_known"),
        lead: leadContexts.has(contextId),
      };
    },
  );

  // Google Ads names and spend for the campaigns ad visitors came from
  // (UTM campaign as the campaign id or name). Optional: without a
  // connection, campaigns show their UTM label.
  const ads = await GoogleAdsService.clientFor(q.projectId).catch(() => null);
  let campaigns: {
    campaignId: string;
    campaignName: string;
    spend: number;
    clicks: number;
  }[] = [];
  let adsError: string | null = null;
  if (ads) {
    const tz = ads.connection.timeZone || "UTC";
    try {
      campaigns = await ads.client.campaignSpend(
        ads.account,
        calendarDay(window.from, tz),
        calendarDay(window.to, tz),
      );
    } catch (error) {
      adsError =
        error instanceof Error
          ? error.message
          : "Google Ads could not be read.";
    }
  }
  const campaignFor = (label: string) =>
    campaigns.find(
      (c) =>
        c.campaignId === label ||
        c.campaignName.trim().toLowerCase() === label.trim().toLowerCase(),
    );

  const paid = visitors.filter((v) => PAID.has(v.channel));
  const byCampaign = [
    ...groupBy(
      paid,
      (v) =>
        v.campaign ??
        (v.clickIdType ? "Ad click, campaign not tagged" : "Paid, no campaign"),
    ),
  ]
    .map(([label, group]) => {
      const campaign = campaignFor(label);
      return {
        ...summarise(campaign?.campaignName ?? label, group),
        spend: campaign ? Math.round(campaign.spend * 100) / 100 : null,
        adClicks: campaign?.clicks ?? null,
      };
    })
    .toSorted((a, b) => b.visitors - a.visitors);

  return {
    visitors: visitors.length,
    byChannel: analyticsChannels
      .map((channel) => ({
        channel,
        ...summarise(
          channel,
          visitors.filter((v) => v.channel === channel),
        ),
      }))
      .filter((row) => row.visitors > 0),
    byAdCampaign: byCampaign,
    byKeyword: [...groupBy(paid, (v) => v.term)]
      .map(([label, group]) => summarise(label, group))
      .toSorted((a, b) => b.visitors - a.visitors)
      .slice(0, 25),
    ads: ads
      ? {
          connected: true,
          currency: ads.connection.currencyCode,
          error: adsError,
        }
      : { connected: false },
    definitions: {
      channel:
        "From the visitor's first touch in the period: an ad click id, UTM tags, or the referring site.",
      clicked:
        "Visitors who clicked that call to action (start trial, book a demo, contact) at least once.",
      signedUp:
        "Visitors who identified themselves: gave a work email to start a trial, or booked a demo. A trial only becomes a qualified lead once it has started in the product.",
      leads:
        "Visitors who became a qualified lead (a demo booked or a trial started), directly or as the same customer.",
      adClicks:
        "Clicks Google Ads counted; more than the visitors seen, because visitors who block tracking or bounce before the page loads are not seen.",
    },
    window,
  };
}
