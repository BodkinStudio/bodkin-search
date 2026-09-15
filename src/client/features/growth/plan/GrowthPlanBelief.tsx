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
  GROWTH_EVIDENCE_KIND_BADGES,
  GROWTH_PLAN_BELIEF_CARDS,
  GROWTH_PLAN_NOT_CLAIMING,
} from "./GrowthPlanPresentation";

// The rules the page holds itself to, and the tag legend that lets a reader
// check the strength of any figure on the page.
export function GrowthPlanBelief() {
  return (
    <section aria-labelledby="growth-plan-belief-title" className={SECTION}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="growth-plan-belief-title" className={SECTION_TITLE}>
          Why you should believe this
        </h2>
        <p className={SECTION_SUB}>
          Three rules this page follows, so you can check us rather than trust
          us
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {GROWTH_PLAN_BELIEF_CARDS.map((card) => (
          <div key={card.title} className={`${CARD} p-5`}>
            <h3 className="text-base font-semibold">{card.title}</h3>
            {card.paragraphs.map((paragraph) => (
              <p
                key={paragraph}
                className="mt-2 text-[13.5px] text-base-content/70"
              >
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-2 text-[12px]">
        {GROWTH_EVIDENCE_KINDS.map((kind) => (
          <li
            key={kind}
            className={`badge ${GROWTH_EVIDENCE_KIND_BADGES[kind]}`}
            title={GROWTH_EVIDENCE_KIND_DESCRIPTIONS[kind]}
          >
            {GROWTH_EVIDENCE_KIND_LABELS[kind]}
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-lg bg-base-200 p-5 md:grid md:grid-cols-[auto_1fr] md:gap-6">
        <h3 className={EYEBROW}>What we are not claiming</h3>
        <ul className="mt-2 grid gap-2 text-[13.5px] text-base-content/70 md:mt-0 md:grid-cols-2">
          {GROWTH_PLAN_NOT_CLAIMING.map((claim) => (
            <li key={claim} className="before:mr-2 before:content-['–']">
              {claim}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
