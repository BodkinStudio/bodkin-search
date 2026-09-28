import type { GrowthSearchPerformanceSnapshot } from "@/types/schemas/growth-search-performance";

const START = "2026-05-01";
const END = "2026-07-29";
const CURRENT_START = "2026-07-02";

function dates(start: string, end: string) {
  const result: string[] = [];
  for (
    let date = new Date(`${start}T00:00:00.000Z`);
    date <= new Date(`${end}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1)
  )
    result.push(date.toISOString().slice(0, 10));
  return result;
}

/** Fixed source fixture for detector tests; it contains exactly 90 Pacific dates. */
export function createGrowthSearchPerformanceFixture(): GrowthSearchPerformanceSnapshot {
  const sourceDates = dates(START, END);
  const observations: GrowthSearchPerformanceSnapshot["observations"] = [];
  const add = (
    rawUrl: string,
    clicks: (date: string) => number,
    missing?: string,
  ) => {
    for (const date of sourceDates) {
      if (date === missing) continue;
      observations.push({
        rawUrl,
        date,
        clicks: clicks(date),
        impressions: 100,
      });
    }
  };
  add("https://example.test/pricing", (date) =>
    date >= CURRENT_START ? 4 : 10,
  );
  // A distinct raw alias shares the curated pricing identity and tests safe aggregation.
  add("http://www.example.test/pricing", () => 1);
  add("https://example.test/stable", () => 8);
  add("https://example.test/growing", (date) =>
    date >= CURRENT_START ? 12 : 8,
  );
  add("https://example.test/low-volume", (date) =>
    date >= CURRENT_START ? 1 : 2,
  );
  add("https://example.test/new-page", () => 0);
  add("https://example.test/incomplete", () => 9, "2026-07-12");

  return {
    projectId: "project_fixture",
    property: "sc-domain:example.test",
    capturedAt: "2026-08-03T12:00:00.000Z",
    source: {
      calendar: "America/Los_Angeles",
      searchType: "web",
      dataState: "final",
      pageRowsMayBeOmitted: true,
    },
    sourceWindow: { startDate: START, endDate: END },
    retrievalStatus: "exhausted",
    observations,
    keyPages: [
      {
        id: "key_growing",
        projectId: "project_fixture",
        url: "https://example.test/growing",
        commercialWeight: 1,
      },
      {
        id: "key_incomplete",
        projectId: "project_fixture",
        url: "https://example.test/incomplete",
        commercialWeight: 1,
      },
      {
        id: "key_low",
        projectId: "project_fixture",
        url: "https://example.test/low-volume",
        commercialWeight: null,
      },
      {
        id: "key_new",
        projectId: "project_fixture",
        url: "https://example.test/new-page",
        commercialWeight: 1,
      },
      {
        id: "key_pricing",
        projectId: "project_fixture",
        url: "https://example.test/pricing",
        commercialWeight: 3,
      },
      {
        id: "key_stable",
        projectId: "project_fixture",
        url: "https://example.test/stable",
        commercialWeight: 1,
      },
    ],
    siteContext: {
      status: "complete",
      observations: sourceDates.map((date) => ({
        date,
        clicks: date >= CURRENT_START ? 130 : 200,
        impressions: 1_000,
      })),
    },
  };
}

export const GROWTH_SEARCH_PERFORMANCE_FIXTURE_WINDOWS = {
  baselineWindow: { startDate: "2026-06-04", endDate: "2026-07-01" },
  currentWindow: { startDate: "2026-07-02", endDate: "2026-07-29" },
} as const;
