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
  it("preserves signed likes without accepting negative views or fractional integer metrics", () => {
    expect(
      normalizeYouTubeReport(report(undefined, [[-1, "2026-03-01", 4]]), input)
        .rows,
    ).toEqual([{ likes: -1, day: "2026-03-01", views: 4 }]);
    expect(() =>
      normalizeYouTubeReport(report(undefined, [[2, "2026-03-01", -4]]), input),
    ).toThrow(YouTubeMalformedResponseError);
    expect(() =>
      normalizeYouTubeReport(
        report(undefined, [[-1.5, "2026-03-01", 4]]),
        input,
      ),
    ).toThrow(YouTubeMalformedResponseError);
  });
  it("allows omitted/suppressed rows", () => {
    expect(normalizeYouTubeReport({ ...report(), rows: [] }, input)).toEqual({
      rows: [],
      observedThrough: null,
    });
  });
  it("validates string video and traffic dimensions without treating them as dates", () => {
    expect(
      normalizeYouTubeReport(
        {
          columnHeaders: [
            { name: "video", columnType: "DIMENSION", dataType: "STRING" },
            { name: "views", columnType: "METRIC", dataType: "INTEGER" },
          ],
          rows: [["abc123", "5"]],
        },
        { dimensions: "video", metrics: ["views"] },
      ),
    ).toEqual({ rows: [{ video: "abc123", views: 5 }], observedThrough: null });
  });
  it.each([
    {
      dimension: "video" as const,
      value: "first,second",
      dataType: "INTEGER",
      metric: 1,
    },
    {
      dimension: "insightTrafficSourceType" as const,
      value: "SEARCH;country==US",
      dataType: "INTEGER",
      metric: 1,
    },
    {
      dimension: "video" as const,
      value: "safe_id",
      dataType: "INTEGER",
      metric: -1,
    },
    {
      dimension: "video" as const,
      value: "safe_id",
      dataType: "INTEGER",
      metric: 1.5,
    },
  ])(
    "rejects unsafe dimensions and invalid metric domains",
    ({ dimension, value, dataType, metric }) => {
      expect(() =>
        normalizeYouTubeReport(
          {
            columnHeaders: [
              { name: dimension, columnType: "DIMENSION", dataType: "STRING" },
              { name: "views", columnType: "METRIC", dataType },
            ],
            rows: [[value, metric]],
          },
          { dimensions: dimension, metrics: ["views"] },
        ),
      ).toThrow(YouTubeMalformedResponseError);
    },
  );
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
