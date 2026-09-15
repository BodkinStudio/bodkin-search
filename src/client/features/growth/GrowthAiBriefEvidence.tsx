import type { SavedGrowthAiBrief } from "@/types/schemas/growth-investigations";

export function GrowthAiBriefEvidence({
  brief,
}: {
  brief: SavedGrowthAiBrief;
}) {
  const generated = brief.generated;
  const labels = (ids: string[]) =>
    ids
      .map(
        (id) =>
          generated.citations.find((citation) => citation.id === id)?.label ??
          id,
      )
      .join("; ");
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-base-content/70">
        Saved AI brief · {new Date(generated.generatedAt).toLocaleString()} ·{" "}
        {brief.model} · {brief.promptVersion}
      </p>
      <p>{generated.businessRelevance}</p>
      {generated.affectedPageUrl ? (
        <p className="text-xs text-base-content/70">
          Affected page: {generated.affectedPageUrl}
        </p>
      ) : null}
      <p className="text-xs text-base-content/70">
        {generated.currentPageRead.status === "read"
          ? `Current page read: ${generated.currentPageRead.resolvedUrl}${generated.currentPageRead.resolvedUrl !== generated.currentPageRead.requestedUrl ? " (after redirect)" : ""}. This is current content, not a historical snapshot.`
          : "The page content could not be inspected. This does not mean the affected URL is unknown."}
      </p>
      {generated.currentBusinessContext === "missing" ? (
        <p className="text-base-content/70">
          Current business context is missing or blank; business fit could not
          be assessed.
        </p>
      ) : null}
      <div>
        <h6 className="font-medium">Cited observations</h6>
        <ul className="list-disc space-y-1 pl-5">
          {generated.observations.map((claim, index) => (
            <li key={index}>
              {claim.statement}{" "}
              <span className="text-xs text-base-content/70">
                ({labels(claim.citationIds)})
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h6 className="font-medium">Hypotheses</h6>
        <ul className="list-disc space-y-1 pl-5">
          {generated.hypotheses.map((claim, index) => (
            <li key={index}>
              {claim.statement} ({claim.confidence} confidence){" "}
              <span className="text-xs text-base-content/70">
                ({labels(claim.citationIds)})
              </span>
            </li>
          ))}
        </ul>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-base-content/70">
        {generated.caveats.map((caveat, index) => (
          <li key={index}>{caveat}</li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer font-medium">
          Saved source excerpts
        </summary>
        <dl className="mt-2 space-y-3">
          {generated.citations.map((citation) => (
            <div key={citation.id}>
              <dt className="font-medium">{citation.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-base-content/70">
                {citation.snapshot ??
                  "See the original saved finding for this evidence."}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <details>
        <summary className="cursor-pointer font-medium">
          Original AI proposal
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {generated.proposedSteps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        <p className="mt-2">
          <span className="font-medium">Measurement approach: </span>
          {generated.measurementApproach}
        </p>
      </details>
    </div>
  );
}
