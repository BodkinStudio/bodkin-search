import { formatModelLabel } from "@/client/features/ai-search/platformLabels";
import {
  brandObservationLabel,
  buildPromptExplorerComparison,
} from "@/client/features/ai-search/components/promptExplorerComparisonData";
import type { PromptExplorerResult } from "@/types/schemas/ai-search";

type Props = {
  result: PromptExplorerResult;
};

export function PromptExplorerComparison({ result }: Props) {
  const comparison = buildPromptExplorerComparison(result);

  return (
    <section
      aria-labelledby="prompt-explorer-comparison-heading"
      className="rounded-lg border border-base-300 bg-base-100"
    >
      <div className="border-b border-base-200 px-5 py-4">
        <h2 id="prompt-explorer-comparison-heading" className="font-semibold">
          Cross-model evidence
        </h2>
        <p className="mt-1 text-sm text-base-content/65">
          Reported observations and cited sources from this response.
        </p>
        {result.highlightBrand ? (
          <p className="mt-1 text-sm text-base-content/65">
            Brand observation: {result.highlightBrand}. Matches can occur in an
            answer or a cited page’s title or URL. They do not verify source
            ownership or a recommendation.
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <caption className="sr-only">
            Model availability, reported brand observation, and unique cited
            source-domain counts
          </caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Result</th>
              <th scope="col">Brand observation</th>
              <th scope="col">Cited domains</th>
            </tr>
          </thead>
          <tbody>
            {result.results.map((modelResult) => {
              const modelLabel = formatModelLabel(modelResult.model);
              if (modelResult.status === "error") {
                return (
                  <tr key={modelResult.model}>
                    <th scope="row">{modelLabel}</th>
                    <td>Unavailable</td>
                    <td>Unavailable</td>
                    <td>Unavailable</td>
                  </tr>
                );
              }

              const domainCount =
                comparison.domainCountByModel.get(modelResult.model) ?? 0;

              return (
                <tr key={modelResult.model}>
                  <th scope="row">{modelLabel}</th>
                  <td>Available</td>
                  <td>
                    {brandObservationLabel(
                      result.highlightBrand,
                      modelResult.brandMentioned,
                    )}
                  </td>
                  <td>{domainCount === 0 ? "None returned" : domainCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-base-200 px-5 py-4">
        <h3 className="text-sm font-semibold">Cited source domains</h3>
        {comparison.domains.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table table-sm">
              <caption className="sr-only">
                Cited source domains with direct citation links for each model
              </caption>
              <thead>
                <tr>
                  <th scope="col">Source domain</th>
                  {result.results.map((modelResult) => (
                    <th key={modelResult.model} scope="col">
                      {formatModelLabel(modelResult.model)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.domains.map((source) => (
                  <tr key={source.domain}>
                    <th scope="row" className="whitespace-nowrap">
                      {source.domain}
                    </th>
                    {result.results.map((modelResult) => {
                      if (modelResult.status === "error") {
                        return <td key={modelResult.model}>Unavailable</td>;
                      }
                      const urls = source.urlsByModel.get(modelResult.model);
                      if (!urls?.length) {
                        return <td key={modelResult.model}>—</td>;
                      }
                      const modelLabel = formatModelLabel(modelResult.model);
                      return (
                        <td key={modelResult.model}>
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            {urls.map((url, index) => (
                              <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="link"
                                aria-label={`Open ${modelLabel} citation from ${source.domain}: source ${index + 1}`}
                              >
                                Source {index + 1}
                              </a>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-base-content/65">
            No cited source domains were returned by available models.
          </p>
        )}
        {comparison.domains.length > 0 ? (
          <p className="mt-2 text-sm text-base-content/65">
            — means that model did not cite this domain in this response.
          </p>
        ) : null}
        {comparison.omittedDomainCount > 0 ? (
          <p className="mt-2 text-sm text-base-content/65">
            {comparison.omittedDomainCount} additional unique cited domain
            {comparison.omittedDomainCount === 1 ? " was" : "s were"} omitted.
          </p>
        ) : null}
      </div>

      <div className="border-t border-base-200 bg-base-200/30 px-5 py-4 text-sm text-base-content/65">
        <p>Review cited pages for relevance and business fit.</p>
        <p className="mt-1">
          Compare responses only with the same prompt and settings. Reopening
          can reuse cached answers, so independent saved snapshots are needed
          for comparisons over time.
        </p>
      </div>
    </section>
  );
}
