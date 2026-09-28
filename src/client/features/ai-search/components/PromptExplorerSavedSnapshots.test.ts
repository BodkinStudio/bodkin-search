import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PromptExplorerSnapshotComparison,
  SavedSnapshotMetadata,
} from "./PromptExplorerSavedSnapshots";
import type { PromptExplorerSnapshot } from "@/types/schemas/ai-search";
const earlier: PromptExplorerSnapshot = {
  id: "a",
  snapshotId: "a",
  snapshotSaveError: null,
  prompt: "Which tools fit?",
  highlightBrand: "YakChat",
  webSearch: true,
  webSearchCountryCode: "GB",
  fetchedAt: "2026-09-01T12:00:00.000Z",
  results: [
    {
      status: "success",
      model: "chat_gpt",
      modelName: "gpt-5",
      text: "Answer",
      citations: [
        {
          url: "https://example.com/old",
          domain: "example.com",
          title: null,
          matchedBrand: false,
        },
      ],
      fanOutQueries: [],
      brandMentioned: true,
      outputTokens: 12,
      webSearch: true,
      cacheProvenance: {
        source: "fresh",
        generatedAt: "2026-09-01T11:59:00.000Z",
      },
    },
  ],
};
const later: PromptExplorerSnapshot = {
  ...earlier,
  id: "b",
  snapshotId: "b",
  fetchedAt: "2026-09-07T12:00:00.000Z",
  results: [
    {
      ...earlier.results[0],
      status: "error",
      model: "chat_gpt",
      errorCode: "UPSTREAM_ERROR",
      message: "Unavailable",
    },
  ],
};
const compare = (a = earlier, b = later) =>
  renderToStaticMarkup(
    createElement(PromptExplorerSnapshotComparison, { first: a, second: b }),
  );
describe("saved snapshot interpretation", () => {
  it("keeps failed models unavailable rather than reporting losses", () => {
    const html = compare();
    expect(html).toContain("Unavailable in one or both");
    expect(html).not.toContain("removed</p>");
  });
  it("blocks different settings and same-snapshot comparisons", () => {
    expect(compare(earlier, { ...later, prompt: "Different" })).toContain(
      "A direct comparison is unavailable",
    );
    expect(compare(earlier, earlier)).toContain(
      "Choose two different snapshots",
    );
  });
  it("shows inspectable source changes and cache provenance, with unsafe URLs excluded", () => {
    const previous = earlier.results[0];
    if (previous.status !== "success")
      throw new Error("Fixture requires success");
    const html = compare(earlier, {
      ...later,
      results: [
        {
          ...previous,
          brandMentioned: false,
          cacheProvenance: { source: "cached", generatedAt: null },
          citations: [
            {
              url: "https://example.com/new",
              domain: null,
              title: null,
              matchedBrand: false,
            },
            {
              url: "javascript:alert(1)",
              domain: null,
              title: null,
              matchedBrand: false,
            },
          ],
        },
      ],
    });
    expect(html).toContain('href="https://example.com/new"');
    expect(html).toContain('href="https://example.com/old"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("1 added, 1 removed");
    expect(html).toContain("Cached response");
    expect(html).toContain("Generated at an unknown time");
    expect(html).toContain("not a fresh independent measurement");
  });
  it("does not collapse a missing brand observation or changed model identity into a loss", () => {
    const previous = earlier.results[0];
    if (previous.status !== "success")
      throw new Error("Fixture requires success");
    expect(
      compare(earlier, {
        ...later,
        results: [{ ...previous, brandMentioned: null }],
      }),
    ).toContain("No brand observation returned");
    expect(
      compare(
        { ...earlier, highlightBrand: null },
        { ...later, highlightBrand: null, results: [previous] },
      ),
    ).toContain("No brand selected");
    expect(
      compare(earlier, {
        ...later,
        results: [{ ...previous, modelName: "another-model" }],
      }),
    ).toContain("Returned model or web-search settings differ");
    expect(
      compare(earlier, {
        ...later,
        results: [{ ...previous, modelName: null }],
      }),
    ).toContain("Model identity unknown; direct comparison unavailable");
  });
  it("preserves prompt, brand, country and generation details in reopened metadata", () => {
    const html = renderToStaticMarkup(
      createElement(SavedSnapshotMetadata, { snapshot: earlier }),
    );
    expect(html).toContain("Which tools fit?");
    expect(html).toContain("YakChat");
    expect(html).toContain("GB");
    expect(html).toContain("gpt-5");
    expect(html).toContain("Fresh response");
  });
});
