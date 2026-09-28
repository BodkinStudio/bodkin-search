import {
  GROWTH_EVIDENCE_KIND_DESCRIPTIONS,
  GROWTH_EVIDENCE_KIND_LABELS,
  GROWTH_EVIDENCE_KINDS,
} from "@/types/schemas/growth-plan";
import {
  CARD,
  EYEBROW,
  SECTION,
  SECTION_SUB,
  SECTION_TITLE,
  EVIDENCE_KIND_BADGE,
  GROWTH_PLAN_BELIEF_CARDS,
  GROWTH_PLAN_NOT_CLAIMING,
} from "./GrowthPlanPresentation";

// The rules the page holds itself to, and the tag legend that lets a reader
// check the strength of any figure on the page. Closed by default: it is the
// same for every project, so it should not stand between a reader and the work.
export function GrowthPlanBelief() {
  return (
    <details id="growth-plan-evidence-rules" className={`${SECTION} group`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2">
        <span className={SECTION_TITLE}>
          <span
            aria-hidden="true"
            className="mr-2 inline-block text-base-content/50 transition-transform group-open:rotate-90"
          >
            ›
          </span>
          How we work with evidence
        </span>
        <span className={SECTION_SUB}>
          Why you should believe this, and what each evidence label means
        </span>
      </summary>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {GROWTH_PLAN_BELIEF_CARDS.map((card) => (
          <div key={card.title} className={`${CARD} p-5`}>
            <h3 className="text-base font-semibold">{card.title}</h3>
            {card.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-2 text-sm text-base-content/70">
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-2 text-xs">
        {GROWTH_EVIDENCE_KINDS.map((kind) => (
          <li
            key={kind}
            className={`badge ${EVIDENCE_KIND_BADGE}`}
            title={GROWTH_EVIDENCE_KIND_DESCRIPTIONS[kind]}
          >
            {GROWTH_EVIDENCE_KIND_LABELS[kind]}
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-lg bg-base-200 p-5 md:grid md:grid-cols-[auto_1fr] md:gap-6">
        <h3 className={EYEBROW}>What we are not claiming</h3>
        <ul className="mt-2 grid gap-2 text-sm text-base-content/70 md:mt-0 md:grid-cols-2">
          {GROWTH_PLAN_NOT_CLAIMING.map((claim) => (
            <li key={claim} className="before:mr-2 before:content-['–']">
              {claim}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
