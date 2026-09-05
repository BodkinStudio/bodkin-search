import { describe, expect, it } from "vitest";
import { YouTubeMalformedResponseError } from "@/server/lib/youtubeErrors";
import { normalizeYouTubeReport } from "./YouTubeReportNormalization";

const input = { dimensions: "day" as const, metrics: ["views", "likes"] };
const report = (
  headers = ["likes", "day", "views"],
  rows: unknown[][] = [[2, "2026-03-01", "4"]],
) => ({
  columnHeaders: headers.map((name) => ({
    name,
    columnType: name === "day" ? "DIMENSION" : "METRIC",
    dataType: name === "day" ? "STRING" : "INTEGER",
  })),
  rows,
});

describe("normalizeYouTubeReport", () => {
  it("uses headers rather than response order and finds observed-through", () => {
    expect(normalizeYouTubeReport(report(), input)).toEqual({
      rows: [{ likes: 2, day: "2026-03-01", views: 4 }],
      observedThrough: "2026-03-01",
    });
  });
  it("allows omitted/suppressed rows", () => {
    expect(normalizeYouTubeReport({ ...report(), rows: [] }, input)).toEqual({
      rows: [],
      observedThrough: null,
    });
  });
  it.each([
    report(["views", "views", "day"]),
    report(["views", "day"]),
    report(["views", "day", "unknown"]),
    report(undefined, [["2026-03-01", 1]]),
    report(undefined, [[2, "bad-day", 4]]),
    report(undefined, [[2, "2026-03-01", Number.POSITIVE_INFINITY]]),
  ])("rejects invalid headers and values", (raw) => {
    expect(() => normalizeYouTubeReport(raw, input)).toThrow(
      YouTubeMalformedResponseError,
    );
  });
});
