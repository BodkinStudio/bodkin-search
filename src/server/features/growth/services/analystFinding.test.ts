import { describe, expect, it } from "vitest";
import { describeFinding } from "./analystFinding";

describe("analyst findings", () => {
  it("says when a near-top query is slipping, with its numbers", () => {
    const finding = describeFinding(
      "striking_distance_query",
      "text web messaging",
      {
        gsc_clicks: { before: 47, after: 15 },
        gsc_impressions: { before: 754, after: 301 },
        gsc_average_position: { before: 5.51, after: 8.06 },
      },
    );
    expect(finding.headline).toBe(
      "“text web messaging” slipped from position 5.5 to 8.1; clicks fell 68% (47 → 15).",
    );
    expect(finding.target).toEqual({
      type: "keyword",
      value: "text web messaging",
    });
  });

  it("ranks a slipping query above a steady one with the same impressions", () => {
    const steady = describeFinding("striking_distance_query", "a", {
      gsc_impressions: { before: 500, after: 500 },
      gsc_average_position: { before: 6, after: 6 },
    });
    const slipping = describeFinding("striking_distance_query", "b", {
      gsc_impressions: { before: 500, after: 500 },
      gsc_average_position: { before: 6, after: 8 },
    });
    expect(slipping.weight).toBeGreaterThan(steady.weight);
  });

  it("names a page by its path when its clicks fall", () => {
    expect(
      describeFinding(
        "priority_page_click_decline",
        "https://site.test/pricing",
        {
          gsc_clicks: { before: 200, after: 120 },
        },
      ).headline,
    ).toBe("Clicks to /pricing fell 40% (200 → 120) over the last 28 days.");
  });
});
