import type { GrowthActionStatus } from "@/types/schemas/growth-actions";
import type {
  GrowthActionEvidenceDto,
  GrowthEvidenceKind,
} from "@/types/schemas/growth-plan";

// The plan speaks to a client, not an operator: it reports where a piece of
// work has got to, not which lifecycle transition is legal next.
export const GROWTH_PLAN_STATUS_BADGES: Record<
  GrowthActionStatus,
  { label: string; className: string }
> = {
  approved: { label: "Ready", className: "badge-ghost" },
  ready: { label: "Ready", className: "badge-ghost" },
  in_progress: { label: "In progress", className: "badge-primary" },
  blocked: { label: "Blocked", className: "badge-warning" },
  implemented: { label: "Shipped", className: "badge-success" },
  measuring: { label: "Measuring", className: "badge-info" },
  evaluated: { label: "Evaluated", className: "badge-success badge-outline" },
  cancelled: { label: "Cancelled", className: "badge-ghost line-through" },
};

export const GROWTH_EVIDENCE_KIND_BADGES: Record<GrowthEvidenceKind, string> = {
  measured: "badge-success",
  sampled: "badge-info",
  estimate: "badge-warning",
  judgement: "badge-secondary",
  reference: "badge-ghost",
};

export const GROWTH_PLAN_SHIPPED_STATUSES: readonly GrowthActionStatus[] = [
  "implemented",
  "measuring",
  "evaluated",
];
export const GROWTH_PLAN_IN_PROGRESS_STATUSES: readonly GrowthActionStatus[] = [
  "in_progress",
  "blocked",
];
export const GROWTH_PLAN_READY_STATUSES: readonly GrowthActionStatus[] = [
  "approved",
  "ready",
];

// Small-caps mono label, used for section eyebrows and column headings so the
// page's structure reads before any of its prose does.
export const EYEBROW =
  "font-mono text-[11px] font-medium tracking-[0.08em] text-base-content/60 uppercase";

// One rhythm for the whole page: a hairline rule with 40px above it and 20px
// below, and nothing else adding vertical space between major sections.
export const SECTION = "mt-10 border-t border-base-300 pt-5";
export const SECTION_TITLE = "text-[22px] font-semibold";
export const SECTION_SUB = "text-[13.5px] text-base-content/60";

// Every card on the plan is the same object: a hairline box, no shadow.
export const CARD = "rounded-lg border border-base-300 bg-base-100";

// Order the case grid reads evidence in: what we measured first, what we judged last.
const GROWTH_EVIDENCE_CASE_ORDER: readonly GrowthEvidenceKind[] = [
  "measured",
  "sampled",
  "estimate",
  "reference",
  "judgement",
];

// Strongest evidence first, and only as much of it as a reader will take in.
export function orderGrowthEvidence(
  evidence: GrowthActionEvidenceDto[],
  limit: number,
) {
  return evidence
    .toSorted(
      (a, b) =>
        GROWTH_EVIDENCE_CASE_ORDER.indexOf(a.kind) -
        GROWTH_EVIDENCE_CASE_ORDER.indexOf(b.kind),
    )
    .slice(0, limit);
}

// Static product copy. These are the rules the plan page holds itself to, so they
// are the same for every project and are not editable from the page.
export const GROWTH_PLAN_BELIEF_CARDS: readonly {
  title: string;
  paragraphs: readonly string[];
}[] = [
  {
    title: "The numbers are yours, not ours",
    paragraphs: [
      "Every figure is read directly from accounts you own and connected: Google Search Console, YouTube Analytics and GA4. Nothing is modelled or forecast. Where we had to use something weaker, a data provider's search estimate, a live Google result on one day, or our own judgement, it is labelled as such next to the number.",
      "AI tools helped us gather and draft this. They did not invent any figure here. Every figure carries its source next to it, with the date it was observed.",
    ],
  },
  {
    title: "We say what we cannot know",
    paragraphs: [
      "Google hides most individual searches, so query counts are always incomplete. Search volume estimates overlap and are not visitors. We cannot prove that a page change caused a ranking change; we can only show what happened before and after, and name what else changed at the same time.",
      "Each piece of evidence says what it cannot tell you. If a claim on this page has no caveat, that is because we checked it directly.",
    ],
  },
  {
    title: "Every action has a test, set before we start",
    paragraphs: [
      "Each piece of work names the number it should move and the window we will compare, written down now. After each window we report the result either way, including when it did not work. You will see that in the ledger at the bottom of this page, not in a slide deck six months later.",
      "Each workstream target is a proposal we are prepared to be judged on, not a forecast.",
    ],
  },
];

export const GROWTH_PLAN_NOT_CLAIMING: readonly string[] = [
  "That any competitor's page section caused its ranking. We only know what their pages answer that yours do not.",
  "That estimated search volumes are people who will buy. They are the size of the conversation, not the size of the market.",
  "That more clicks are more revenue. Clicks only become revenue once you can follow a page through to a paying customer.",
  "That a decline has a single cause. Demand, rankings, query mix and Google's result page can all have moved.",
];
