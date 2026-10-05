// The channel a visit came through, from what the first touch carried: an ad
// click id, UTM tags, or the referring site. Computed at read time so the
// rules can improve without rewriting stored events.

export const analyticsChannels = [
  "Paid search",
  "Paid social",
  "Organic search",
  "AI answer",
  "Organic social",
  "Email",
  "Referral",
  "Direct",
] as const;
type AnalyticsChannel = (typeof analyticsChannels)[number];

type ChannelTouch = {
  campaignSource?: string | null;
  campaignMedium?: string | null;
  referrerHost?: string | null;
  clickIdType?: string | null;
  /** The page the touch landed on: a referrer on the same site is navigation, not a source. */
  pageHost?: string | null;
};

const siteOf = (host: string) => host.replace(/^www\./, "");

const SEARCH_HOSTS =
  /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|brave|startpage|qwant)\.[a-z.]+$/;
const AI_HOSTS =
  /(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|gemini\.google\.com|copilot\.microsoft\.com|claude\.ai|you\.com|phind\.com|poe\.com|meta\.ai|deepseek\.com|grok\.com)$/;
const SOCIAL_HOSTS =
  /(^|\.)(linkedin\.com|lnkd\.in|facebook\.com|fb\.com|instagram\.com|x\.com|twitter\.com|t\.co|youtube\.com|reddit\.com|tiktok\.com|threads\.net)$/;
const MAIL_HOSTS =
  /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$/;
const SEARCH_SOURCES = /^(google|bing|microsoft|duckduckgo|yahoo|ecosia)$/;
const SOCIAL_SOURCES =
  /^(linkedin|facebook|fb|meta|instagram|ig|x|twitter|youtube|reddit|tiktok)$/;
const AI_SOURCES = /^(chatgpt|openai|perplexity|gemini|copilot|claude)(\.|$)/;
const PAID_MEDIUMS =
  /^(cpc|ppc|paid|paidsearch|paid[-_ ]?search|paid[-_ ]?social|paidsocial|display|cpm|cpv|banner|retargeting)$/;

const SEARCH_CLICKS = new Set(["gclid", "gbraid", "wbraid", "msclkid"]);
const SOCIAL_CLICKS = new Set(["fbclid", "li_fat_id", "ttclid"]);

export function channelFor(touch: ChannelTouch): AnalyticsChannel {
  const source = touch.campaignSource?.trim().toLowerCase() ?? "";
  const medium = touch.campaignMedium?.trim().toLowerCase() ?? "";
  const referrer = touch.referrerHost?.trim().toLowerCase() ?? "";
  const page = touch.pageHost?.trim().toLowerCase() ?? "";
  const host =
    referrer && page && siteOf(referrer) === siteOf(page) ? "" : referrer;

  // fbclid is also added to organic Facebook links, so only search click ids
  // are paid on their own; social click ids need a paid medium to count.
  if (touch.clickIdType && SEARCH_CLICKS.has(touch.clickIdType))
    return "Paid search";
  if (PAID_MEDIUMS.test(medium)) {
    if (
      SOCIAL_SOURCES.test(source) ||
      medium.includes("social") ||
      (touch.clickIdType && SOCIAL_CLICKS.has(touch.clickIdType))
    )
      return "Paid social";
    return "Paid search";
  }
  if (medium === "email" || medium === "newsletter" || MAIL_HOSTS.test(host))
    return "Email";
  if (AI_SOURCES.test(source) || AI_HOSTS.test(host)) return "AI answer";
  if (
    medium === "organic" ||
    SEARCH_SOURCES.test(source) ||
    SEARCH_HOSTS.test(host)
  )
    return "Organic search";
  if (
    medium === "social" ||
    SOCIAL_SOURCES.test(source) ||
    SOCIAL_HOSTS.test(host)
  )
    return "Organic social";
  if (source || host) return "Referral";
  return "Direct";
}
