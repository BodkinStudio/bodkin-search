import { describe, expect, it } from "vitest";
import type { CompetitorResearchResult } from "@/shared/competitorResearch";
import {
  buildCompetitorAnalysisDraft,
  rankingDifference,
  researchSourceUrl,
} from "./competitorResearchPresentation";

const row = {
  keyword: "business messaging",
  competitorPosition: 3,
  projectPosition: 12,
  competitorUrl: "https://competitor.test/messaging",
  projectUrl: "https://example.test/product",
  searchVolume: 100,
  cpc: null,
  keywordDifficulty: null,
};
const report: CompetitorResearchResult = {
  projectDomain: "example.test",
  competitorDomain: "competitor.test",
  locationCode: 2840,
  languageCode: "en",
  fetchedAt: "2026-09-07T00:00:00Z",
  topic: null,
  rows: [row],
  warnings: ["Bounded sample."],
  billing: { providerCallsMaximum: 2, estimateUsd: null, estimateKnown: false },
};

describe("competitor research presentation", () => {
  it("does not turn unknown ranks into an advantage", () => {
    expect(rankingDifference(row)).toBe("Competitor ahead");
    expect(rankingDifference({ ...row, projectPosition: null })).toBe(
      "Not comparable",
    );
    expect(rankingDifference({ ...row, competitorPosition: null })).toBe(
      "Not comparable",
    );
    expect(rankingDifference({ ...row, projectPosition: 2 })).toBe(
      "Your site ahead",
    );
    expect(rankingDifference({ ...row, projectPosition: 3 })).toBe(
      "Same position",
    );
  });
  it("only links public web protocols without credentials", () => {
    expect(researchSourceUrl(row.competitorUrl)).toBe(row.competitorUrl);
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://user:pass@example.test",
      "not-a-url",
      null,
    ])
      expect(researchSourceUrl(url)).toBeNull();
  });
  it("carries only selected bounded evidence and its market/date/limitations to an unsent analysis draft", () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      ...row,
      keyword: `term ${index}`,
    }));
    const text = buildCompetitorAnalysisDraft(
      { ...report, rows },
      rows.slice(1).map((item) => item.keyword),
    );
    const evidence: unknown = JSON.parse(text.slice(text.indexOf("{")));
    expect(evidence).toHaveProperty("rows.length", 10);
    expect(evidence).toHaveProperty("rows.0.keyword", "term 1");
    expect(evidence).toMatchObject({
      locationCode: 2840,
      languageCode: "en",
      fetchedAt: report.fetchedAt,
      warnings: report.warnings,
    });
    expect(text).toContain("untrusted observations");
    expect(text).toContain("Ask before additional paid research");
    expect(text).toContain("competitor-brand searches");
  });
});
