import { describe, expect, it } from "vitest";
import { buildGrowthPreview } from "@/server/features/growth/services/GrowthPreviewService";
import {
  describeGrowthPreviewPage,
  filterGrowthPreviewPages,
  formatGrowthPreviewCount,
  formatGrowthPreviewDate,
} from "./GrowthPreviewPresentation";

describe("GrowthPreview presentation", () => {
  it("defaults to flagged pages and filters names or URLs without mutating data", async () => {
    const { pages } = await buildGrowthPreview();
    expect(
      filterGrowthPreviewPages(pages, false, "").map((page) => page.keyPageId),
    ).toEqual(["key_pricing"]);
    expect(filterGrowthPreviewPages(pages, true, "")).toHaveLength(6);
    expect(
      filterGrowthPreviewPages(pages, true, "  STABLE  ")[0]?.keyPageId,
    ).toBe("key_stable");
    expect(
      filterGrowthPreviewPages(pages, true, "example.com/pricing")[0]
        ?.keyPageId,
    ).toBe("key_pricing");
    expect(filterGrowthPreviewPages(pages, false, "stable")).toEqual([]);
    expect(filterGrowthPreviewPages(pages, true, "no-match")).toEqual([]);
    expect(pages).toHaveLength(6);
  });

  it("keeps missing observations, zero and insufficient traffic distinct", async () => {
    const { pages } = await buildGrowthPreview();
    const byId = (id: string) =>
      describeGrowthPreviewPage(pages.find((page) => page.keyPageId === id)!);
    expect(byId("key_incomplete").explanation).toContain(
      "Missing data is not zero clicks",
    );
    expect(byId("key_new").label).toBe("No baseline clicks");
    expect(byId("key_low").label).toBe("Too little baseline traffic");
    expect(byId("key_stable").explanation).toContain(
      "not a general assessment",
    );
    expect(byId("key_pricing").explanation).toContain(
      "does not establish its cause",
    );
  });

  it("formats a calendar date without local timezone drift and preserves unknown counts", () => {
    expect(formatGrowthPreviewDate("2026-07-02")).toBe("2 Jul 2026");
    expect(formatGrowthPreviewCount(null)).toBe("Unavailable");
    expect(formatGrowthPreviewCount(0)).toBe("0");
    expect(formatGrowthPreviewCount(1234)).toBe("1,234");
  });
});
