// The learning read of Google Ads (self-learning ads loop, phase 1): which
// searches are worth more and which are spending without result, and which
// headlines and descriptions Google rates best and worst. Pure: the report
// supplies Google's rows and the site's own keyword results.

export type SearchTermRow = {
  searchTerm: string;
  status: string | null;
  keyword: string | null;
  matchType: string | null;
  campaignName: string;
  adGroupName: string | null;
  impressions: number;
  clicks: number;
  spend: number;
  googleConversions: number;
};

/** What ad visitors on a keyword did on the site (from the visit tags). */
type KeywordResult = {
  visitors: number;
  signedUp: number;
  leads: number;
};

type SearchTermVerdict = "promising" | "spending_no_result" | "too_early";

/** Clicks before a search term with no result is called out (not judged sooner). */
export const NO_RESULT_MIN_CLICKS = 5;

const norm = (value: string) => value.trim().toLowerCase();

export function judgeSearchTerms(
  rows: SearchTermRow[],
  byKeyword: Map<string, KeywordResult>,
) {
  return rows.map((row) => {
    const site = row.keyword
      ? (byKeyword.get(norm(row.keyword)) ?? null)
      : null;
    const excluded = row.status === "EXCLUDED";
    const verdict: SearchTermVerdict =
      row.googleConversions > 0 ||
      (site && (site.leads > 0 || site.signedUp > 0))
        ? "promising"
        : !excluded && row.clicks >= NO_RESULT_MIN_CLICKS
          ? "spending_no_result"
          : "too_early";
    return {
      ...row,
      spend: Math.round(row.spend * 100) / 100,
      site,
      excluded,
      verdict,
    };
  });
}

type AssetRow = {
  text: string;
  fieldType: string | null;
  rating: string | null;
  campaignName: string | null;
  adGroupName: string | null;
  impressions: number;
  clicks: number;
};

const RATING_RANK: Record<string, number> = {
  BEST: 4,
  GOOD: 3,
  LOW: 1,
  LEARNING: 2,
  PENDING: 2,
};

const ratingLabel = (rating: string | null) =>
  rating === "BEST"
    ? "Best"
    : rating === "GOOD"
      ? "Good"
      : rating === "LOW"
        ? "Low"
        : rating === "LEARNING" || rating === "PENDING"
          ? "Learning"
          : "Unrated";

/**
 * One line per headline or description, across the ads that use it: its
 * impressions and clicks summed, and the best rating Google gave it (a text
 * rated Best in one ad group and Low in another is still worth keeping).
 */
export function summariseAssets(rows: AssetRow[]) {
  const byText = new Map<
    string,
    {
      text: string;
      fieldType: string;
      rating: string;
      rank: number;
      low: boolean;
      impressions: number;
      clicks: number;
      adGroups: Set<string>;
    }
  >();
  for (const row of rows) {
    const fieldType =
      row.fieldType === "DESCRIPTION" ? "Description" : "Headline";
    const key = `${fieldType}:${row.text}`;
    const rank = RATING_RANK[row.rating ?? ""] ?? 0;
    const current = byText.get(key) ?? {
      text: row.text,
      fieldType,
      rating: "Unrated",
      rank: -1,
      low: false,
      impressions: 0,
      clicks: 0,
      adGroups: new Set<string>(),
    };
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    if (row.adGroupName) current.adGroups.add(row.adGroupName);
    if (row.rating === "LOW") current.low = true;
    if (rank > current.rank) {
      current.rank = rank;
      current.rating = ratingLabel(row.rating);
    }
    byText.set(key, current);
  }
  return [...byText.values()]
    .map(({ rank: _rank, adGroups, ...asset }) => ({
      ...asset,
      clickRate: asset.impressions
        ? Math.round((asset.clicks / asset.impressions) * 1000) / 10
        : 0,
      adGroups: adGroups.size,
    }))
    .toSorted((a, b) => b.impressions - a.impressions);
}
