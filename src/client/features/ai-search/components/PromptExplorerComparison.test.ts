import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromptExplorerComparison } from "./PromptExplorerComparison";
import {
  MAX_COMPARISON_DOMAINS,
  brandObservationLabel,
  buildPromptExplorerComparison,
} from "./promptExplorerComparisonData";
import type { PromptExplorerResult } from "@/types/schemas/ai-search";

function resultWith(
  results: PromptExplorerResult["results"],
  highlightBrand: string | null = "OpenSEO",
): PromptExplorerResult {
  return {
    prompt: "Which SEO tools should I use?",
    highlightBrand,
    fetchedAt: "2026-09-07T12:00:00.000Z",
    results,
  };
}

describe("buildPromptExplorerComparison", () => {
  it("dedupes repeated domains and URLs within each model while retaining model evidence", () => {
    const comparison = buildPromptExplorerComparison(
      resultWith([
        {
          status: "success",
          model: "chat_gpt",
          modelName: null,
          text: "",
          citations: [
            {
              url: "https://www.example.com/a",
              domain: null,
              title: null,
              matchedBrand: false,
            },
            {
              url: "https://example.com/b",
              domain: null,
              title: null,
              matchedBrand: false,
            },
            {
              url: "https://example.com/b",
              domain: null,
              title: null,
              matchedBrand: false,
            },
          ],
          fanOutQueries: [],
          brandMentioned: true,
          outputTokens: null,
          webSearch: true,
        },
        {
          status: "success",
          model: "claude",
          modelName: null,
          text: "",
          citations: [
            {
              url: "https://example.com/c",
              domain: null,
              title: null,
              matchedBrand: false,
            },
          ],
          fanOutQueries: [],
          brandMentioned: false,
          outputTokens: null,
          webSearch: true,
        },
      ]),
    );

    expect(comparison.domains).toHaveLength(1);
    expect(comparison.domains[0]?.urlsByModel.get("chat_gpt")).toEqual([
      "https://www.example.com/a",
      "https://example.com/b",
    ]);
    expect(comparison.domains[0]?.urlsByModel.get("claude")).toEqual([
      "https://example.com/c",
    ]);
  });

  it("drops unsafe URLs and caps domain rows with an omitted count", () => {
    const citations = Array.from(
      { length: MAX_COMPARISON_DOMAINS + 2 },
      (_, index) => ({
        url: `https://source-${index}.example.com/page`,
        domain: null,
        title: null,
        matchedBrand: false,
      }),
    );
    citations.push({
      url: "javascript:alert(1)",
      domain: null,
      title: null,
      matchedBrand: false,
    });
    const comparison = buildPromptExplorerComparison(
      resultWith([
        {
          status: "success",
          model: "gemini",
          modelName: null,
          text: "",
          citations,
          fanOutQueries: [],
          brandMentioned: null,
          outputTokens: null,
          webSearch: true,
        },
      ]),
    );

    expect(comparison.domains).toHaveLength(MAX_COMPARISON_DOMAINS);
    expect(comparison.omittedDomainCount).toBe(2);
  });
});

describe("PromptExplorerComparison", () => {
  it("renders availability and preserves no brand selection from an absence observation", () => {
    const html = renderToStaticMarkup(
      createElement(PromptExplorerComparison, {
        result: resultWith(
          [
            {
              status: "success",
              model: "chat_gpt",
              modelName: null,
              text: "",
              citations: [],
              fanOutQueries: [],
              brandMentioned: false,
              outputTokens: null,
              webSearch: true,
            },
            {
              status: "error",
              model: "perplexity",
              errorCode: "UPSTREAM_ERROR",
              message: "Timed out",
            },
          ],
          null,
        ),
      }),
    );

    expect(html).toContain("Available");
    expect(html).toContain("Unavailable");
    expect(html).toContain("No brand selected");
    expect(html).toContain("None returned");
    expect(html).toContain(
      "No cited source domains were returned by available models.",
    );
  });

  it("uses distinct reported brand-observation labels", () => {
    expect(brandObservationLabel("OpenSEO", true)).toBe(
      "Reported in answer or citations",
    );
    expect(brandObservationLabel("OpenSEO", false)).toBe(
      "Not reported in answer or citations",
    );
    expect(brandObservationLabel("OpenSEO", null)).toBe(
      "No brand observation returned",
    );
  });
});
