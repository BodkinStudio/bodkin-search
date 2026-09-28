// Turns a Growth check signal into an analyst's note: what happened, in one
// sentence with its numbers, and what to do about it. Pure, so the wording
// rules are tested on their own.

export type SignalMetrics = Record<
  string,
  { before: number | null; after: number | null }
>;

type Finding = {
  // Short enough to be a plan action's title.
  title: string;
  headline: string;
  suggestion: string;
  // Rough size of the opportunity or risk, used to rank findings.
  weight: number;
  target: { type: "keyword" | "url"; value: string } | null;
};

const count = (value: number | null | undefined) =>
  value == null ? "–" : Math.round(value).toLocaleString("en-GB");
const position = (value: number | null | undefined) =>
  value == null ? "–" : value.toFixed(1);
const percent = (before: number | null, after: number | null) =>
  before && after != null
    ? `${Math.abs(Math.round(((after - before) / before) * 100))}%`
    : null;
const path = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

type Describe = (subject: string, metrics: SignalMetrics) => Finding;

function strikingDistance(subject: string, metrics: SignalMetrics): Finding {
  const clicks = metrics.gsc_clicks;
  const rank = metrics.gsc_average_position;
  const slipped =
    rank?.before != null && rank.after != null && rank.after - rank.before >= 1;
  const clickChange = percent(clicks?.before ?? null, clicks?.after ?? null);
  const clickNote = clickChange
    ? `; clicks ${(clicks?.after ?? 0) < (clicks?.before ?? 0) ? "fell" : "rose"} ${clickChange} (${count(clicks?.before)} → ${count(clicks?.after)})`
    : "";
  const impressions = metrics.gsc_impressions?.after ?? 0;
  return {
    title: `${slipped ? "Win back" : "Push into the top three for"} “${subject}”`,
    headline: slipped
      ? `“${subject}” slipped from position ${position(rank?.before)} to ${position(rank?.after)}${clickNote}.`
      : `“${subject}” is close to the top: position ${position(rank?.after)} with ${count(impressions)} impressions in 28 days.`,
    suggestion: slipped
      ? "Refresh the page that ranks for it: answer the query directly and link to it from related pages."
      : "Improve the page that ranks for it to move it into the top three, where most clicks go.",
    weight: impressions * (slipped ? 1.5 : 1),
    target: { type: "keyword", value: subject },
  };
}

const DESCRIBERS: Record<string, Describe> = {
  striking_distance_query: strikingDistance,
  ctr_below_expected: (subject, metrics) => {
    const ctr = metrics.gsc_ctr?.after;
    const impressions = metrics.gsc_impressions?.after;
    return {
      title: `Earn more clicks for “${subject}”`,
      headline: `“${subject}” ranks ${position(metrics.gsc_average_position?.after)} but only ${ctr == null ? "–" : (ctr * 100).toFixed(1)}% of searchers click (${count(metrics.gsc_clicks?.after)} clicks from ${count(impressions)} impressions).`,
      suggestion:
        "Rewrite the page title and description so they promise what these searchers want.",
      weight: impressions ?? 0,
      target: { type: "keyword", value: subject },
    };
  },
  priority_page_click_decline: (subject, metrics) => {
    const before = metrics.gsc_clicks?.before ?? null;
    const after = metrics.gsc_clicks?.after ?? null;
    return {
      title: `Recover clicks to ${path(subject)}`,
      headline: `Clicks to ${path(subject)} fell ${percent(before, after) ?? ""} (${count(before)} → ${count(after)}) over the last 28 days.`,
      suggestion:
        "Check what changed on the page and in its search results, then restore or rework it.",
      weight: Math.max(0, (before ?? 0) - (after ?? 0)) * 3,
      target: { type: "url", value: subject },
    };
  },
  tracked_rank_drop: (subject, metrics) => {
    const floor = metrics.organic_rank_position_floor;
    return {
      title: `Recover the ranking for “${subject}”`,
      headline: `“${subject}” dropped from position ${count(floor?.before)} to ${count(floor?.after)} in your tracked rankings.`,
      suggestion:
        "Compare the pages now ranking above you and close the gap on the ranking page.",
      weight: Math.max(0, (floor?.after ?? 0) - (floor?.before ?? 0)) * 50,
      target: { type: "keyword", value: subject },
    };
  },
  new_critical_audit_issue: (subject) => ({
    title: `Fix a critical site issue: ${subject}`,
    headline: `A new critical site issue appeared in the latest audit: ${subject}.`,
    suggestion: "Fix it before it affects crawling or rankings.",
    weight: 500,
    target: null,
  }),
};

export function describeFinding(
  signalType: string,
  subject: string,
  metrics: SignalMetrics,
): Finding {
  const describe = DESCRIBERS[signalType];
  if (describe) return describe(subject, metrics);
  return {
    title: `Look into ${subject}`,
    headline: `Something changed for ${subject}.`,
    suggestion: "Take a look and decide whether it needs work.",
    weight: 0,
    target: null,
  };
}
