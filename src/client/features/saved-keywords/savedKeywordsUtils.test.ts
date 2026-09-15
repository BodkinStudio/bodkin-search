import { describe, expect, it } from "vitest";
import type { SavedKeywordRow } from "@/types/keywords";
import { trackingKeywordsFromSavedRows } from "./savedKeywordsUtils";

function row(keyword: string, id = keyword): SavedKeywordRow {
  return {
    id,
    projectId: "project-id",
    keyword,
    locationCode: 2840,
    languageCode: "en",
    createdAt: "2026-01-01T00:00:00.000Z",
    searchVolume: null,
    cpc: null,
    competition: null,
    keywordDifficulty: null,
    intent: null,
    monthlySearches: [],
    fetchedAt: null,
    tags: [],
  };
}

describe("trackingKeywordsFromSavedRows", () => {
  it("trims terms, excludes blanks, and keeps the first case-insensitive duplicate", () => {
    expect(
      trackingKeywordsFromSavedRows([
        row("  running shoes  ", "one"),
        row("", "two"),
        row("RUNNING SHOES", "three"),
        row("trail shoes", "four"),
      ]),
    ).toEqual(["running shoes", "trail shoes"]);
  });
});
