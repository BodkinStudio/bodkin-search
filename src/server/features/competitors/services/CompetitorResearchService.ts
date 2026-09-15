import {
  isLabsLocationCode,
  isSupportedLanguageCode,
  isLanguageServedForLocation,
} from "@/shared/keyword-locations";
import { waitUntil } from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { mapKeywordItem } from "@/server/features/domain/services/domainKeywordMapper";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { parseResearchTargetOrThrow } from "@/server/lib/domainUtils";
import { AppError } from "@/server/lib/errors";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { escapeLikeTerm } from "@/server/lib/dataforseo/filters";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import {
  competitorResearchResultSchema,
  type CompetitorResearchResult,
} from "@/shared/competitorResearch";

const COMPETITOR_KEYWORD_LIMIT = 50;
const COMPETITOR_RESEARCH_TTL_SECONDS = 12 * 60 * 60;

type Input = {
  projectId: string;
  projectDomain: string | null;
  competitorDomain: string;
  locationCode: number;
  languageCode: string;
  topic?: string;
};

function sameDomain(left: string, right: string): boolean {
  return (
    left.toLowerCase().replace(/^www\./, "") ===
    right.toLowerCase().replace(/^www\./, "")
  );
}

type KeywordRow = NonNullable<ReturnType<typeof mapKeywordItem>>;

function selectBestKeywordRows(rows: KeywordRow[]): KeywordRow[] {
  const byKeyword = new Map<string, KeywordRow>();
  for (const row of rows) {
    const key = row.keyword.toLowerCase();
    const existing = byKeyword.get(key);
    if (
      !existing ||
      (row.position != null &&
        (existing.position == null || row.position < existing.position))
    ) {
      byKeyword.set(key, row);
    }
  }
  return [...byKeyword.values()];
}

function unknownProjectKeywordsWarning(): string {
  return "Some project rankings are unknown because the exact-keyword lookup was truncated or did not report a total.";
}

async function compare(
  input: Input,
  billingCustomer: BillingCustomerContext,
): Promise<CompetitorResearchResult> {
  if (!input.projectDomain) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Set a project domain before comparing competitors.",
    );
  }
  const projectDomain = parseResearchTargetOrThrow(
    input.projectDomain,
  ).hostname;
  const competitorDomain = parseResearchTargetOrThrow(
    input.competitorDomain,
  ).hostname;
  if (sameDomain(projectDomain, competitorDomain)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Choose a competitor with a different domain.",
    );
  }

  const projectContext = await ProjectContextService.getProjectContext(
    input.projectId,
  );
  if (
    !projectContext.competitors.some((row) =>
      sameDomain(row.domain, competitorDomain),
    )
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Choose a competitor saved to this project.",
    );
  }

  if (
    !isLabsLocationCode(input.locationCode) ||
    !isSupportedLanguageCode(input.languageCode) ||
    !isLanguageServedForLocation(input.locationCode, input.languageCode)
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Choose a supported country and language for competitor research.",
    );
  }

  const cacheKey = await buildCacheKey("competitor:keyword-research", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    projectDomain,
    competitorDomain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    topic: input.topic ?? null,
  });
  const cached = competitorResearchResultSchema.safeParse(
    await getCached(cacheKey),
  );
  if (cached.success) return cached.data;

  const client = createDataforseoClient(billingCustomer);
  const competitorResponse = await client.domain.rankedKeywords({
    target: competitorDomain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    limit: COMPETITOR_KEYWORD_LIMIT,
    orderBy: ["ranked_serp_element.serp_item.etv,desc"],
    filters: input.topic
      ? [["keyword_data.keyword", "ilike", `%${escapeLikeTerm(input.topic)}%`]]
      : undefined,
  });
  const competitorRows = competitorResponse.items
    .map(mapKeywordItem)
    .filter(
      (row): row is NonNullable<ReturnType<typeof mapKeywordItem>> =>
        row != null,
    );
  const uniqueCompetitorRows = selectBestKeywordRows(competitorRows);
  const keywords = uniqueCompetitorRows.map((row) => row.keyword);

  const projectResponse =
    keywords.length === 0
      ? { items: [], totalCount: 0 }
      : await client.domain.rankedKeywords({
          target: projectDomain,
          locationCode: input.locationCode,
          languageCode: input.languageCode,
          limit: COMPETITOR_KEYWORD_LIMIT,
          // DataForSEO Labs ranked_keywords supports `in` with a list value.
          filters: [["keyword_data.keyword", "in", keywords]],
        });
  const projectRows = selectBestKeywordRows(
    projectResponse.items
      .map(mapKeywordItem)
      .filter(
        (row): row is NonNullable<ReturnType<typeof mapKeywordItem>> =>
          row != null,
      ),
  );
  const projectByKeyword = new Map(
    projectRows.map((row) => [row.keyword.toLowerCase(), row]),
  );
  const projectResultsComplete =
    projectResponse.totalCount !== null &&
    projectResponse.totalCount <= projectResponse.items.length;
  const warnings = [
    input.topic
      ? `Competitor keywords match “${input.topic}” and are capped at ${COMPETITOR_KEYWORD_LIMIT} top-traffic rows.`
      : `Competitor keywords are a top-traffic sample capped at ${COMPETITOR_KEYWORD_LIMIT} rows.`,
    ...(competitorResponse.totalCount !== null &&
    competitorResponse.totalCount > COMPETITOR_KEYWORD_LIMIT
      ? ["More competitor keywords exist outside this sample."]
      : []),
    ...(!projectResultsComplete ? [unknownProjectKeywordsWarning()] : []),
  ];
  const result: CompetitorResearchResult = {
    projectDomain,
    competitorDomain,
    topic: input.topic ?? null,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    fetchedAt: new Date().toISOString(),
    rows: uniqueCompetitorRows.map((competitor) => {
      const project = projectByKeyword.get(competitor.keyword.toLowerCase());
      return {
        keyword: competitor.keyword,
        competitorPosition: competitor.position,
        projectPosition: project?.position ?? null,
        competitorUrl: competitor.url,
        projectUrl: project?.url ?? null,
        searchVolume: competitor.searchVolume,
        cpc: competitor.cpc,
        keywordDifficulty: competitor.keywordDifficulty,
      };
    }),
    warnings,
    billing: {
      providerCallsMaximum: 2,
      estimateUsd: null,
      estimateKnown: false,
    },
  };

  waitUntil(
    setCached(cacheKey, result, COMPETITOR_RESEARCH_TTL_SECONDS).catch(
      (error) => {
        console.error("competitor.keyword-research.cache-write failed:", error);
      },
    ),
  );
  return result;
}

export const CompetitorResearchService = { compare } as const;
