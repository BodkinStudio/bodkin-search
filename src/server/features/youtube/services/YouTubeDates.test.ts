import { describe, expect, it } from "vitest";
import { YouTubeReportError } from "@/server/lib/youtubeErrors";
import { resolveYouTubeDateRange } from "./YouTubeDates";

const now = new Date("2026-03-09T07:30:00.000Z"); // March 9 in Pacific time (DST boundary)

describe("resolveYouTubeDateRange", () => {
  it("uses the last 28 complete Pacific days and an adjacent comparison", () => {
    expect(resolveYouTubeDateRange({}, now)).toEqual({
      requestedDateRange: null,
      resolvedDateRange: { startDate: "2026-02-09", endDate: "2026-03-08" },
      previousDateRange: { startDate: "2026-01-12", endDate: "2026-02-08" },
    });
  });
  it.each([
    [{ startDate: "2024-02-29", endDate: "2024-02-29" }],
    [{ startDate: "2026-01-01", endDate: "2026-01-28" }],
    [{ startDate: "2025-12-07", endDate: "2026-03-06" }],
    [{ startDate: "2008-07-03", endDate: "2008-07-04" }],
  ])("supports valid bounded explicit ranges", (input) => {
    expect(resolveYouTubeDateRange(input, now).resolvedDateRange).toEqual(
      input,
    );
  });
  it.each([
    { startDate: "2026-01-01" },
    { startDate: "2026-02-30", endDate: "2026-03-01" },
    { startDate: "2026-03-02", endDate: "2026-03-01" },
    { startDate: "2026-01-01", endDate: "2026-04-01" },
    { startDate: "2026-03-09", endDate: "2026-03-09" },
    { startDate: "2008-06-30", endDate: "2008-06-30" },
    { startDate: "2008-07-01", endDate: "2008-07-01" },
    { startDate: "2008-07-02", endDate: "2008-07-03" },
  ])(
    "rejects incomplete, invalid, reversed, future, oversized, and too-old input",
    (input) => {
      expect(() => resolveYouTubeDateRange(input, now)).toThrow(
        YouTubeReportError,
      );
    },
  );
});
