import { describe, expect, it } from "vitest";
import { projectFrozenGrowthSearchPerformanceFacts } from "./GrowthMeasurementGscProjector";

const period = {
  periodType: "baseline" as const,
  effectiveStart: "2026-05-01",
  effectiveEnd: "2026-05-02",
};
const metrics = [
  {
    metricId: "clicks",
    metricType: "search_clicks" as const,
    entityType: "url",
    entityKey: "https://example.test/pricing",
  },
  {
    metricId: "impressions",
    metricType: "search_impressions" as const,
    entityType: "url",
    entityKey: "https://example.test/pricing",
  },
];

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "project_1",
    property: "sc-domain:example.test",
    capturedAt: "2026-05-06T12:00:00.000Z",
    sourceWindow: {
      startDate: "2026-05-01",
      endDate: "2026-05-02",
    },
    retrievalStatus: "exhausted" as const,
    requestsUsed: 1,
    observations: [
      {
        rawUrl: "https://example.test/pricing",
        date: "2026-05-01",
        clicks: 0,
        impressions: 2,
      },
      {
        rawUrl: "https://example.test/pricing",
        date: "2026-05-02",
        clicks: 3,
        impressions: 5,
      },
    ],
    ...overrides,
  };
}

describe("projectFrozenGrowthSearchPerformanceFacts", () => {
  it("projects complete explicit-zero observations deterministically without provider details", async () => {
    const result = await projectFrozenGrowthSearchPerformanceFacts({
      snapshot: snapshot(),
      period,
      metrics: metrics.toReversed(),
    });
    expect(result.facts).toMatchObject([
      { metricId: "clicks", value: 3, completeness: 1 },
      { metricId: "impressions", value: 7, completeness: 1 },
    ]);
    expect(result.evidenceRef).toMatch(
      /^gsc:measurement:v1:[a-f0-9]{64}:[a-f0-9]{64}$/,
    );
    expect(JSON.stringify(result)).not.toContain("sc-domain:example.test");
  });

  it("rejects capped retrieval, a missing coordinate, URL variants, and unsafe sums", async () => {
    await expect(
      projectFrozenGrowthSearchPerformanceFacts({
        snapshot: snapshot({ retrievalStatus: "capped" }),
        period,
        metrics,
      }),
    ).rejects.toThrow("must be exhausted");
    await expect(
      projectFrozenGrowthSearchPerformanceFacts({
        snapshot: snapshot({ observations: [snapshot().observations[0]] }),
        period,
        metrics,
      }),
    ).rejects.toThrow("incomplete");
    await expect(
      projectFrozenGrowthSearchPerformanceFacts({
        snapshot: snapshot({
          observations: snapshot().observations.map((row) => ({
            ...row,
            rawUrl: "https://example.test/pricing/",
          })),
        }),
        period,
        metrics,
      }),
    ).rejects.toThrow("incomplete");
    await expect(
      projectFrozenGrowthSearchPerformanceFacts({
        snapshot: snapshot({
          observations: [
            { ...snapshot().observations[0], clicks: Number.MAX_SAFE_INTEGER },
            { ...snapshot().observations[1], clicks: 1 },
          ],
        }),
        period,
        metrics,
      }),
    ).rejects.toThrow("safe integer");
  });
});
