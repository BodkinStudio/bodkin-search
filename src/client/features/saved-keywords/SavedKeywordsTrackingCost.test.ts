import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SavedKeywordsTrackingCost } from "./SavedKeywordsTrackingCost";

describe("SavedKeywordsTrackingCost", () => {
  it("shows the prospective full recurring cost separately from initial checks", () => {
    const html = renderToStaticMarkup(
      createElement(SavedKeywordsTrackingCost, {
        config: {
          devices: "desktop",
          serpDepth: 40,
          scheduleInterval: "weekly",
          isActive: true,
          keywordCount: 9,
        },
        keywordCount: 1,
      }),
    );
    expect(html).toContain("weekly");
    expect(html).toContain("10 keywords");
    expect(html).toContain("per scheduled check");
    expect(html).toContain("per month");
    expect(html).toContain("fall back to live checks");
    expect(html).toContain("initial rank check");
  });
  it("distinguishes manual destinations from recurring checks", () => {
    const html = renderToStaticMarkup(
      createElement(SavedKeywordsTrackingCost, {
        config: {
          devices: "desktop",
          serpDepth: 40,
          scheduleInterval: "manual",
          isActive: true,
          keywordCount: 9,
        },
        keywordCount: 1,
      }),
    );
    expect(html).toContain("No recurring checks are scheduled");
    expect(html).not.toContain("per month");
  });
});
