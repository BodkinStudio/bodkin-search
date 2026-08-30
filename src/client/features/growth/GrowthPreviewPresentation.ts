import type { GrowthPreviewPage } from "@/types/schemas/growth-preview";

type SuppressionReason = Extract<
  GrowthPreviewPage,
  { status: "suppressed" }
>["reason"];

const SUPPRESSION_COPY: Record<
  SuppressionReason,
  { label: string; explanation: string }
> = {
  retrieval_capped: {
    label: "Incomplete retrieval",
    explanation:
      "The source row limit was reached. A decline cannot be assessed from this incomplete retrieval.",
  },
  site_context_incomplete: {
    label: "Missing site context",
    explanation:
      "The requested site-wide comparison is incomplete, so the detector has withheld a page-level conclusion.",
  },
  missing_observation: {
    label: "Missing observations",
    explanation:
      "At least one expected daily observation is missing. Missing data is not zero clicks, so this page cannot be assessed for the comparison.",
  },
  zero_baseline: {
    label: "No baseline clicks",
    explanation:
      "The baseline contains zero observed clicks. There is no non-zero baseline for a percentage decline comparison.",
  },
  low_baseline: {
    label: "Too little baseline traffic",
    explanation:
      "The baseline has too few clicks to meet this rule's minimum traffic threshold. The detector has withheld a decline signal.",
  },
  not_material: {
    label: "Below decline threshold",
    explanation:
      "This page does not meet the rule's minimum click loss and percentage decline thresholds. That is not a general assessment of its SEO health.",
  },
  site_wide_decline: {
    label: "Similar to site-wide decline",
    explanation:
      "The page's decline is within the rule's margin for site-wide movement. It has not been singled out as a page-specific decline.",
  },
};

export function describeGrowthPreviewPage(page: GrowthPreviewPage) {
  if (page.status === "flagged") {
    return {
      label: "Needs attention",
      explanation:
        "This page meets the priority-page click-decline rule. The observation identifies a change worth reviewing; it does not establish its cause.",
    };
  }
  return SUPPRESSION_COPY[page.reason];
}

export function filterGrowthPreviewPages(
  pages: GrowthPreviewPage[],
  showAll: boolean,
  query: string,
) {
  const search = query.trim().toLowerCase();
  return pages.filter(
    (page) =>
      (showAll || page.status === "flagged") &&
      `${page.label} ${page.url}`.toLowerCase().includes(search),
  );
}

export function formatGrowthPreviewDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

export function formatGrowthPreviewCount(value: number | null) {
  return value === null ? "Unavailable" : value.toLocaleString("en-GB");
}
