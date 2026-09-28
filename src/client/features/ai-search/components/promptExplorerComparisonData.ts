import { safeHostname, safeHttpUrl } from "@/server/features/ai-search/safeUrl";
import type {
  PromptExplorerModel,
  PromptExplorerResult,
} from "@/types/schemas/ai-search";

export const MAX_COMPARISON_DOMAINS = 10;

type ComparisonSource = {
  domain: string;
  urlsByModel: Map<PromptExplorerModel, string[]>;
};

type PromptExplorerComparison = {
  domains: ComparisonSource[];
  domainCountByModel: Map<PromptExplorerModel, number>;
  omittedDomainCount: number;
};

/**
 * Builds the bounded source-domain comparison from one Prompt Explorer
 * response. A domain is counted once per successful model, even if that model
 * returned several citations from the domain.
 */
export function buildPromptExplorerComparison(
  result: PromptExplorerResult,
): PromptExplorerComparison {
  const sourcesByDomain = new Map<string, ComparisonSource>();

  for (const modelResult of result.results) {
    if (modelResult.status === "error") continue;

    for (const citation of modelResult.citations) {
      const url = safeHttpUrl(citation.url);
      const domain = safeHostname(url);
      if (!url || !domain) continue;

      let source = sourcesByDomain.get(domain);
      if (!source) {
        source = { domain, urlsByModel: new Map() };
        sourcesByDomain.set(domain, source);
      }

      const urls = source.urlsByModel.get(modelResult.model) ?? [];
      if (!urls.includes(url)) {
        urls.push(url);
        source.urlsByModel.set(modelResult.model, urls);
      }
    }
  }

  const allDomains = [...sourcesByDomain.values()];
  const domainCountByModel = new Map<PromptExplorerModel, number>();
  for (const source of allDomains) {
    for (const model of source.urlsByModel.keys()) {
      domainCountByModel.set(model, (domainCountByModel.get(model) ?? 0) + 1);
    }
  }

  return {
    domains: allDomains.slice(0, MAX_COMPARISON_DOMAINS),
    domainCountByModel,
    omittedDomainCount: Math.max(0, allDomains.length - MAX_COMPARISON_DOMAINS),
  };
}

export function brandObservationLabel(
  highlightBrand: string | null,
  brandMentioned: boolean | null,
): string {
  if (!highlightBrand) return "No brand selected";
  if (brandMentioned === true) return "Reported in answer or citations";
  if (brandMentioned === false) return "Not reported in answer or citations";
  return "No brand observation returned";
}
