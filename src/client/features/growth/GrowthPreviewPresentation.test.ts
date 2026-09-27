import { describe, expect, it } from "vitest";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";

describe("Growth date presentation", () => {
  it("formats a calendar date without local timezone drift", () => {
    expect(formatGrowthPreviewDate("2026-07-02")).toBe("2 Jul 2026");
  });
});
