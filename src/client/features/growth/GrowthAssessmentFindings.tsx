import type { getGrowthAssessmentInvestigation } from "@/serverFunctions/growthAssessmentInvestigations";
import { GrowthInvestigationResearch } from "./GrowthInvestigationResearch";

type Investigation = NonNullable<
  Awaited<ReturnType<typeof getGrowthAssessmentInvestigation>>
>;

const verdictLabels = {
  change: "Recommended change",
  investigate: "Resolve this before changing the page",
  deprioritise: "Do not prioritise this page yet",
};

const sourceLabels: Record<string, string> = {
  accepted_assessment: "Saved assessment",
  owned_page: "Read the page",
  search_performance: "Search Console evidence",
  project_context: "Saved project context",
  commercial_page: "Commercial page evidence",
};

export function GrowthAssessmentFindings({
  investigation,
}: {
  investigation: Investigation;
}) {
  const decision = investigation.decision;
  if (!decision) return null;
  return (
    <div>
      <p className="text-sm font-medium text-base-content/65">
        {verdictLabels[decision.verdict]}
      </p>
      <h3 className="mt-2 text-2xl font-semibold text-balance">
        {decision.headline}
      </h3>
      <p className="mt-3 text-base leading-relaxed">{decision.rationale}</p>
      <div className="mt-6 border-l-2 border-primary pl-4">
        <h4 className="font-semibold">What to do next</h4>
        <p className="mt-2 text-sm leading-relaxed">{decision.nextAction}</p>
        <p className="mt-3 text-sm leading-relaxed text-base-content/75">
          <span className="font-medium">What this should achieve: </span>
          {decision.expectedOutcome}
        </p>
        {decision.verdict !== "deprioritise" ? (
          <GrowthInvestigationResearch investigation={investigation} />
        ) : null}
      </div>
      <div className="mt-6 space-y-4 text-sm leading-relaxed">
        <div>
          <h4 className="font-semibold">Why we looked at this page</h4>
          <p className="mt-1 text-base-content/80">{decision.whyThisPage}</p>
        </div>
        <div>
          <h4 className="font-semibold">How we’ll judge the result</h4>
          <p className="mt-1 text-base-content/80">{decision.measurement}</p>
        </div>
        {decision.caveat ? (
          <p className="text-base-content/70">
            <span className="font-medium">
              What the evidence cannot tell us:{" "}
            </span>
            {decision.caveat}
          </p>
        ) : null}
      </div>
      <details className="mt-6 border-t border-base-300 pt-4">
        <summary className="cursor-pointer text-sm font-medium">
          Evidence behind this decision
        </summary>
        <div className="mt-4 space-y-5">
          {investigation.evidence
            .filter((item) => decision.evidenceIds.includes(item.id))
            .map((item) => (
              <article key={item.id} className="text-sm">
                <h4 className="font-semibold">{item.title}</h4>
                <p className="mt-2 whitespace-pre-line break-words leading-relaxed text-base-content/80">
                  {item.text}
                </p>
                <p className="mt-2 text-xs text-base-content/65">
                  {item.scope}
                </p>
                {item.url ? (
                  <a
                    className="link mt-2 inline-block break-all"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {sourceLabels[item.source] ?? item.source}
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-base-content/65">
                    {sourceLabels[item.source] ?? item.source}
                  </p>
                )}
                <p className="mt-1 text-xs text-base-content/60">
                  Checked {new Date(item.observedAt).toLocaleString("en-GB")}
                </p>
              </article>
            ))}
        </div>
      </details>
      <p className="mt-5 text-xs text-base-content/60">
        Saved{" "}
        {new Date(
          investigation.completedAt ?? investigation.startedAt,
        ).toLocaleString("en-GB")}
        . This is a recommendation; your website has not been changed.
      </p>
    </div>
  );
}
