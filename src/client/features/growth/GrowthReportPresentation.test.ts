import { describe, expect, it } from "vitest";
import {
  formatGrowthReportDate,
  formatGrowthReportFact,
  formatGrowthReportMonth,
  formatGrowthReportTimestamp,
  GROWTH_REPORT_SECTION_TITLES,
} from "./GrowthReportPresentation";

describe("Growth Report presentation", () => {
  it("formats the report calendar without the host timezone changing it", () => {
    expect(formatGrowthReportMonth("2026-08-01")).toBe("August 2026");
    expect(formatGrowthReportDate("2026-08-31")).toBe("31 Aug 2026");
    expect(formatGrowthReportTimestamp("2026-09-01T08:05:00.000Z")).toBe(
      "1 Sept 2026, 08:05 UTC",
    );
  });

  it("keeps false, zero and null facts distinct", () => {
    expect(formatGrowthReportFact(false)).toBe("No");
    expect(formatGrowthReportFact(0)).toBe("0");
    expect(formatGrowthReportFact(null)).toBe("Not available");
    expect(formatGrowthReportFact("Saved text")).toBe("Saved text");
  });

  it("names every canonical section", () => {
    expect(Object.values(GROWTH_REPORT_SECTION_TITLES)).toEqual([
      "Executive summary",
      "Performance",
      "Meaningful changes",
      "Work completed",
      "Results from earlier work",
      "Risks",
      "Opportunities",
      "Next month",
    ]);
  });
});
