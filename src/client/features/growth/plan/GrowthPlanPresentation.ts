import type { GrowthActionStatus } from "@/types/schemas/growth-actions";
import { GROWTH_WORK_STATUS_LABELS } from "../GrowthWorkPresentation";
import type {
  GrowthActionEvidenceDto,
  GrowthEvidenceKind,
} from "@/types/schemas/growth-plan";

// One vocabulary for work status across the plan and the operations views.
export const GROWTH_PLAN_STATUS_BADGES: Record<
  GrowthActionStatus,
  { label: string; className: string }
> = {
  approved: {
    label: GROWTH_WORK_STATUS_LABELS.approved,
    className: "badge-ghost",
  },
  ready: { label: GROWTH_WORK_STATUS_LABELS.ready, className: "badge-ghost" },
  in_progress: {
    label: GROWTH_WORK_STATUS_LABELS.in_progress,
    className: "badge-primary",
  },
  blocked: {
    label: GROWTH_WORK_STATUS_LABELS.blocked,
    className: "badge-warning",
  },
  implemented: {
    label: GROWTH_WORK_STATUS_LABELS.implemented,
    className: "badge-success",
  },
  measuring: {
    label: GROWTH_WORK_STATUS_LABELS.measuring,
    className: "badge-info",
  },
  evaluated: {
    label: GROWTH_WORK_STATUS_LABELS.evaluated,
    className: "badge-success badge-outline",
  },
  cancelled: {
    label: GROWTH_WORK_STATUS_LABELS.cancelled,
    className: "badge-ghost line-through",
  },
};

// Evidence kinds are labels, not verdicts: one neutral badge so a colour never
// reads as good or bad. The kinds are explained in the evidence disclosure.
export const EVIDENCE_KIND_BADGE = "badge-ghost";

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

// Type roles for the plan, on the app's own scale.
export const EYEBROW =
  "text-xs font-medium tracking-wide text-base-content/60 uppercase";
export const SECTION = "mt-10 border-t border-base-300 pt-6";
export const SECTION_TITLE = "text-xl font-semibold";
export const SECTION_SUB = "text-sm text-base-content/60";

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
