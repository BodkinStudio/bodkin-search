import { describe, expect, it } from "vitest";
import {
  judgeSearchTerms,
  summariseAssets,
  type SearchTermRow,
} from "./ads-insights";

const term = (over: Partial<SearchTermRow>): SearchTermRow => ({
  searchTerm: "sms for teams",
  status: "NONE",
  keyword: "sms teams",
  matchType: "PHRASE",
  campaignName: "Search UK",
  adGroupName: "SMS",
  impressions: 100,
  clicks: 6,
  spend: 12.345,
  googleConversions: 0,
  ...over,
});

describe("judgeSearchTerms", () => {
  it("calls a term promising when its keyword brought sign-ups or leads on the site, whatever Google counted", () => {
    const [row] = judgeSearchTerms(
      [term({})],
      new Map([["sms teams", { visitors: 4, signedUp: 1, leads: 0 }]]),
    );
    expect(row).toMatchObject({
      verdict: "promising",
      spend: 12.35,
      site: { signedUp: 1 },
    });
  });

  it("calls out a term spending with no result only after enough clicks", () => {
    const judged = judgeSearchTerms(
      [
        term({ searchTerm: "free sms", clicks: 6 }),
        term({ searchTerm: "sms jobs", clicks: 2 }),
      ],
      new Map([["sms teams", { visitors: 5, signedUp: 0, leads: 0 }]]),
    );
    expect(judged.map((r) => [r.searchTerm, r.verdict])).toEqual([
      ["free sms", "spending_no_result"],
      ["sms jobs", "too_early"],
    ]);
  });

  it("never calls out a term that is already a negative keyword", () => {
    const [row] = judgeSearchTerms(
      [term({ status: "EXCLUDED", clicks: 20 })],
      new Map(),
    );
    expect(row).toMatchObject({ excluded: true, verdict: "too_early" });
  });

  it("matches the keyword case-insensitively and trusts Google's conversions too", () => {
    const [a, b] = judgeSearchTerms(
      [
        term({ keyword: "SMS Teams" }),
        term({ keyword: null, googleConversions: 1 }),
      ],
      new Map([["sms teams", { visitors: 1, signedUp: 0, leads: 1 }]]),
    );
    expect([a?.verdict, b?.verdict]).toEqual(["promising", "promising"]);
  });
});

describe("summariseAssets", () => {
  it("one line per text across ad groups, keeping the best rating and flagging any low one", () => {
    const assets = summariseAssets([
      {
        text: "SMS in Teams",
        fieldType: "HEADLINE",
        rating: "LOW",
        campaignName: "c",
        adGroupName: "a",
        impressions: 100,
        clicks: 2,
      },
      {
        text: "SMS in Teams",
        fieldType: "HEADLINE",
        rating: "BEST",
        campaignName: "c",
        adGroupName: "b",
        impressions: 300,
        clicks: 10,
      },
      {
        text: "Reply from one inbox",
        fieldType: "DESCRIPTION",
        rating: "LEARNING",
        campaignName: "c",
        adGroupName: "a",
        impressions: 50,
        clicks: 1,
      },
    ]);
    expect(assets).toEqual([
      {
        text: "SMS in Teams",
        fieldType: "Headline",
        rating: "Best",
        low: true,
        impressions: 400,
        clicks: 12,
        clickRate: 3,
        adGroups: 2,
      },
      {
        text: "Reply from one inbox",
        fieldType: "Description",
        rating: "Learning",
        low: false,
        impressions: 50,
        clicks: 1,
        clickRate: 2,
        adGroups: 1,
      },
    ]);
  });
});
