// Ad spend against results: what each campaign cost, what Google reported as
// conversions, and what the site saw those ad visitors actually do (signed
// up, became a qualified lead), with how much of the ad traffic the site saw
// at all. Pure: the report supplies Google's rows and the site's traffic.

type Campaign = {
  campaignId: string;
  campaignName: string;
  channelType: string | null;
  spend: number;
  clicks: number;
  impressions: number;
  googleConversions: number;
};

type SiteRow = {
  label: string;
  visitors: number;
  clicked: { start_trial: number; book_demo: number; contact: number };
  signedUp: number;
  leads: number;
};

type Counted = {
  campaignName: string | null;
  action: string;
  category: string | null;
  conversions: number;
  allConversions: number;
};

type Action = { name: string; category: string | null; primary: boolean };

const CHANNEL_TYPE: Record<string, string> = {
  PERFORMANCE_MAX: "Performance Max",
  SEARCH: "Search",
  DISPLAY: "Display",
  VIDEO: "Video",
  DEMAND_GEN: "Demand Gen",
  SHOPPING: "Shopping",
  SMART: "Smart",
};

const CATEGORY: Record<string, string> = {
  PAGE_VIEW: "Page view",
  DEFAULT: "Other",
  ENGAGEMENT: "Engagement",
  OUTBOUND_CLICK: "Outbound click",
  DOWNLOAD: "Download",
  CONTACT: "Contact",
  PHONE_CALL_LEAD: "Phone call",
  SUBMIT_LEAD_FORM: "Lead form",
  BOOK_APPOINTMENT: "Booking",
  SIGNUP: "Sign-up",
  REQUEST_QUOTE: "Quote request",
  QUALIFIED_LEAD: "Qualified lead",
  CONVERTED_LEAD: "Converted lead",
  IMPORTED_LEAD: "Imported lead",
  PURCHASE: "Purchase",
  ADD_TO_CART: "Add to cart",
  BEGIN_CHECKOUT: "Begin checkout",
  GET_DIRECTIONS: "Get directions",
  STORE_VISIT: "Store visit",
};

/** Google categories that record a lead or a sale, rather than a visit or a click. */
const LEAD_CATEGORIES = new Set([
  "SUBMIT_LEAD_FORM",
  "BOOK_APPOINTMENT",
  "SIGNUP",
  "REQUEST_QUOTE",
  "QUALIFIED_LEAD",
  "CONVERTED_LEAD",
  "IMPORTED_LEAD",
  "PURCHASE",
]);

const label = (map: Record<string, string>, value: string | null) =>
  value
    ? (map[value] ??
      value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " "))
    : "Unknown";
const money = (n: number) => Math.round(n * 100) / 100;
const per = (spend: number, count: number) =>
  count > 0 ? money(spend / count) : null;
const rate = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
const norm = (value: string) => value.trim().toLowerCase();

export function adsScorecard(input: {
  campaigns: Campaign[];
  /** The site's ad visitors by campaign (labelled by the campaign's name or id). */
  siteCampaigns: SiteRow[];
  /** The site's visitors by first-touch channel. */
  siteChannels: SiteRow[];
  counted: Counted[];
  actions: Action[];
}) {
  const site = (c: Campaign) =>
    input.siteCampaigns.find(
      (r) => norm(r.label) === norm(c.campaignName) || r.label === c.campaignId,
    );
  const campaigns = input.campaigns
    .map((c) => {
      const s = site(c);
      const visitors = s?.visitors ?? 0;
      const signedUp = s?.signedUp ?? 0;
      const leads = s?.leads ?? 0;
      return {
        campaignName: c.campaignName,
        type: label(CHANNEL_TYPE, c.channelType),
        spend: money(c.spend),
        clicks: c.clicks,
        costPerClick: per(c.spend, c.clicks),
        googleConversions: Math.round(c.googleConversions * 10) / 10,
        costPerGoogleConversion: per(c.spend, c.googleConversions),
        visitorsSeen: visitors,
        seenRate: rate(visitors, c.clicks),
        startTrialClicks: s?.clicked.start_trial ?? 0,
        bookDemoClicks: s?.clicked.book_demo ?? 0,
        signedUp,
        costPerSignUp: per(c.spend, signedUp),
        leads,
        costPerLead: per(c.spend, leads),
      };
    })
    .toSorted((a, b) => b.spend - a.spend);

  const sum = (
    key:
      | "spend"
      | "clicks"
      | "googleConversions"
      | "visitorsSeen"
      | "signedUp"
      | "leads",
  ) => campaigns.reduce((total, c) => total + c[key], 0);
  const spend = money(sum("spend"));
  const clicks = sum("clicks");
  const googleConversions = Math.round(sum("googleConversions") * 10) / 10;
  const visitorsSeen = sum("visitorsSeen");
  const signedUp = sum("signedUp");
  const leads = sum("leads");

  const primary = new Map(input.actions.map((a) => [a.name, a.primary]));
  const byAction = new Map<
    string,
    {
      action: string;
      category: string | null;
      conversions: number;
      allConversions: number;
    }
  >();
  for (const row of input.counted) {
    const current = byAction.get(row.action) ?? {
      action: row.action,
      category: row.category,
      conversions: 0,
      allConversions: 0,
    };
    current.conversions += row.conversions;
    current.allConversions += row.allConversions;
    byAction.set(row.action, current);
  }
  const conversionActions = [...byAction.values()]
    .map((a) => ({
      action: a.action,
      category: label(CATEGORY, a.category),
      recordsALead: a.category ? LEAD_CATEGORIES.has(a.category) : false,
      usedForBidding: primary.get(a.action) ?? false,
      conversions: Math.round(a.conversions * 10) / 10,
      allConversions: Math.round(a.allConversions * 10) / 10,
    }))
    .toSorted((a, b) => b.allConversions - a.allConversions);
  const biddingConversions = conversionActions
    .filter((a) => a.usedForBidding)
    .reduce((total, a) => total + a.conversions, 0);
  const biddingOnLeads = conversionActions
    .filter((a) => a.usedForBidding && a.recordsALead)
    .reduce((total, a) => total + a.conversions, 0);

  const channelRow = (name: string, rows: SiteRow[]) => {
    const visitors = rows.reduce((t, r) => t + r.visitors, 0);
    const trial = rows.reduce((t, r) => t + r.clicked.start_trial, 0);
    const demo = rows.reduce((t, r) => t + r.clicked.book_demo, 0);
    const up = rows.reduce((t, r) => t + r.signedUp, 0);
    const lead = rows.reduce((t, r) => t + r.leads, 0);
    return {
      channel: name,
      visitors,
      startTrialRate: rate(trial, visitors),
      bookDemoRate: rate(demo, visitors),
      signedUp: up,
      signUpRate: rate(up, visitors),
      leads: lead,
    };
  };
  const paid = new Set(["Paid search", "Paid social"]);
  const comparison = [
    channelRow(
      "Ads",
      input.siteChannels.filter((r) => paid.has(r.label)),
    ),
    channelRow(
      "Organic search",
      input.siteChannels.filter((r) => r.label === "Organic search"),
    ),
    channelRow(
      "Everything else",
      input.siteChannels.filter(
        (r) => !paid.has(r.label) && r.label !== "Organic search",
      ),
    ),
  ];

  return {
    totals: {
      spend,
      clicks,
      costPerClick: per(spend, clicks),
      googleConversions,
      visitorsSeen,
      seenRate: rate(visitorsSeen, clicks),
      signedUp,
      costPerSignUp: per(spend, signedUp),
      leads,
      costPerLead: per(spend, leads),
      biddingConversions: Math.round(biddingConversions * 10) / 10,
      /** Share of the conversions bidding optimises for that record a lead rather than a visit or click. */
      biddingOnLeadsRate: rate(biddingOnLeads, biddingConversions),
    },
    campaigns,
    conversionActions,
    comparison,
  };
}
