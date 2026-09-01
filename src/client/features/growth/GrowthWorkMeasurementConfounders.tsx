import type { GrowthWorkMeasurementConfounders as Confounders } from "@/types/schemas/growth-work";
import { GROWTH_CHANGE_LABELS } from "./GrowthChangePresentation";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";

export function GrowthWorkMeasurementConfounders({
  confounders,
}: {
  confounders: Confounders;
}) {
  if (confounders.state === "closed") return null;
  return (
    <div className="mt-5 border-t border-base-300 pt-4">
      <h4 className="font-semibold">Possible confounding changes</h4>
      <p className="mt-1 text-xs text-base-content/70">
        Exact recorded page changes from{" "}
        <span className="tabular-nums">
          {formatGrowthPreviewDate(confounders.intervalStart)} –{" "}
          {formatGrowthPreviewDate(confounders.intervalEnd)}
        </span>
        . These are possible context, not proof that a change affected the
        comparison.
      </p>
      <GrowthWorkMeasurementConfounderState confounders={confounders} />
      <p className="mt-3 text-xs text-base-content/70">
        This checks exact recorded page URLs only. Site-wide or template
        effects, unrecorded changes and URL variants are not assessed. Displayed
        URLs may omit query details or be withheld; descriptions containing
        recognised credential material are redacted.
      </p>
    </div>
  );
}

function GrowthWorkMeasurementConfounderState({
  confounders,
}: {
  confounders: Confounders;
}) {
  if (confounders.state === "unavailable")
    return (
      <p role="alert" className="mt-3">
        This older plan has no selected website-change anchor, so possible
        confounding changes cannot be separated safely.
      </p>
    );
  if (confounders.state === "overflow")
    return (
      <p role="alert" className="mt-3">
        More than {confounders.limit} exact recorded changes overlap this
        comparison. The partial list is withheld so it is not mistaken for a
        complete review.
      </p>
    );
  if (confounders.state === "none")
    return (
      <p className="mt-3 text-base-content/70">
        No exact recorded page changes were found in this interval. That does
        not show that the comparison was unaffected.
      </p>
    );
  return (
    <ol className="mt-3 divide-y divide-base-300">
      {confounders.candidates.map((candidate) => (
        <li key={candidate.id} className="py-4 first:pt-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h5 className="font-medium">
              {GROWTH_CHANGE_LABELS[candidate.changeType]}
            </h5>
            <p className="text-sm tabular-nums text-base-content/70">
              Changed {formatGrowthPreviewDate(candidate.happenedAt)} (UTC)
            </p>
          </div>
          {candidate.description.length > 300 ? (
            <details className="mt-2 max-w-prose text-sm">
              <summary className="cursor-pointer break-words [overflow-wrap:anywhere]">
                {candidate.description.slice(0, 180)}… Read full note
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {candidate.description}
              </p>
            </details>
          ) : (
            <p className="mt-2 max-w-prose whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
              {candidate.description}
            </p>
          )}
          <p className="mt-2 text-xs font-medium text-base-content/70">
            Exact measured page match
          </p>
          <ul className="mt-1 text-sm text-base-content/70">
            {candidate.matchedDisplayUrls.map((url, index) => (
              <li key={`${index}:${url}`} className="break-all">
                {url ?? "Matched page URL withheld"}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
