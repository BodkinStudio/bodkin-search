import { describe, expect, it } from "vitest";
import { previousCompleteGrowthMonthlyPeriod } from "./GrowthMonthlyReportPeriod";

describe("previousCompleteGrowthMonthlyPeriod", () => {
  it.each([
    {
      cutoff: "2027-01-15T12:00:00.000Z",
      timezone: "UTC",
      expected: { periodStart: "2026-12-01", periodEnd: "2026-12-31" },
    },
    {
      cutoff: "2028-03-01T12:00:00.000Z",
      timezone: "UTC",
      expected: { periodStart: "2028-02-01", periodEnd: "2028-02-29" },
    },
    {
      cutoff: "2026-09-01T00:30:00.000Z",
      timezone: "America/Los_Angeles",
      expected: { periodStart: "2026-07-01", periodEnd: "2026-07-31" },
    },
    {
      cutoff: "2026-08-31T23:30:00.000Z",
      timezone: "Asia/Tokyo",
      expected: { periodStart: "2026-08-01", periodEnd: "2026-08-31" },
    },
  ])(
    "derives $expected.periodStart at timezone and month boundaries",
    (row) => {
      expect(
        previousCompleteGrowthMonthlyPeriod(row.cutoff, row.timezone),
      ).toEqual(row.expected);
    },
  );
});
