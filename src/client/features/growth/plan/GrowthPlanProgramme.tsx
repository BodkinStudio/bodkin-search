import type { GrowthPlanActionDto } from "@/types/schemas/growth-plan";
import {
  CARD,
  EYEBROW,
  SECTION,
  SECTION_SUB,
  SECTION_TITLE,
} from "./GrowthPlanPresentation";

// Phases run from the earliest due date in the plan, so a plan reads as a
// sequence of commitments rather than a list of dates.
const PHASES = [
  { label: "Weeks 1–2", endDay: 14 },
  { label: "Weeks 3–6", endDay: 42 },
  { label: "Weeks 7–12", endDay: 84 },
  { label: "Months 4–6", endDay: 183 },
  { label: "Months 7–12", endDay: 365 },
  { label: "Later", endDay: Number.POSITIVE_INFINITY },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const TITLE_LIMIT = 4;

const dayNumber = (value: string) =>
  Math.floor(Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`) / DAY_MS);

const phaseIndexFor = (offsetDays: number) => {
  const index = PHASES.findIndex((phase) => offsetDays < phase.endDay);
  return index === -1 ? PHASES.length - 1 : index;
};

export function GrowthPlanProgramme({
  actions,
}: {
  actions: GrowthPlanActionDto[];
}) {
  const dated = actions
    .map((action) => ({ action, day: dayNumber(action.dueOn) }))
    .filter((entry) => Number.isFinite(entry.day))
    .toSorted((a, b) => a.day - b.day);
  if (dated.length === 0) return null;

  // Day 0 is the earlier of the first due date and today, so a plan whose dates
  // have already passed still puts "Now" in the first phase rather than beyond
  // the end of the programme.
  const today = Math.floor(Date.now() / DAY_MS);
  const start = Math.min(dated[0].day, today);
  const currentIndex = phaseIndexFor(today - start);
  const phases = PHASES.map((phase, index) => ({
    ...phase,
    index,
    entries: dated
      .filter((entry) => phaseIndexFor(entry.day - start) === index)
      .map((entry) => entry.action),
  })).filter((phase) => phase.entries.length > 0);

  return (
    <section aria-labelledby="growth-plan-programme-title" className={SECTION}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="growth-plan-programme-title" className={SECTION_TITLE}>
          Programme
        </h2>
        <p className={SECTION_SUB}>
          A focused first quarter, then evidence-led expansion
        </p>
      </div>
      <ol className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] items-stretch gap-3">
        {phases.map((phase) => (
          <li
            key={phase.label}
            className={`${CARD} px-[14px] py-3 ${
              phase.index === currentIndex ? "border-t-2 border-t-primary" : ""
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className={EYEBROW}>{phase.label}</h3>
              {phase.index === currentIndex ? (
                <span className="badge badge-primary badge-sm">Now</span>
              ) : null}
            </div>
            <ul className="mt-2 space-y-1 text-[13.5px] [overflow-wrap:anywhere]">
              {phase.entries.slice(0, TITLE_LIMIT).map((action) => (
                <li key={action.id}>{action.title}</li>
              ))}
            </ul>
            {phase.entries.length > TITLE_LIMIT ? (
              <p className="mt-2 text-[13.5px] text-base-content/60">
                +{phase.entries.length - TITLE_LIMIT} more
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
