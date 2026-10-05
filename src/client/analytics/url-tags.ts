// What a landing URL says about where the visit came from.

/** UTM tags, minus anything that looks like a credential or an email. */
export function campaignFrom(url: URL): Record<string, string> {
  const campaign: Record<string, string> = {};
  for (const field of ["source", "medium", "campaign", "content", "term"]) {
    const value = url.searchParams.get(`utm_${field}`);
    if (value && !/@|bearer|token=/i.test(value))
      campaign[field] = value.slice(0, 150);
  }
  return campaign;
}

// An ad platform's click id (Google, Microsoft, Meta, LinkedIn, TikTok): it
// marks a paid click even when the ad carries no UTM tags.
const CLICK_ID_PARAMS = [
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "fbclid",
  "li_fat_id",
  "ttclid",
];
export function clickIdFrom(
  url: URL,
): { type: string; value: string } | undefined {
  for (const type of CLICK_ID_PARAMS) {
    const value = url.searchParams.get(type);
    if (value && /^[\w.~-]{1,200}$/.test(value)) return { type, value };
  }
  return undefined;
}
