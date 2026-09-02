import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrowthOperatingOverviewDto } from "@/types/schemas/growth-operating-overview";

const query = vi.hoisted(() => ({
  refetch: vi.fn(),
  state: {
    isPending: false,
    isError: false,
    isFetching: false,
    data: undefined as GrowthOperatingOverviewDto | undefined,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: () => query.state }));
vi.mock("@/serverFunctions/growthOperatingOverview", () => ({
  getGrowthOperatingOverview: vi.fn(),
}));

import {
  GrowthOperatingOverview,
  GrowthOperatingOverviewMetrics,
  boundedOverviewCount,
  monthlyOverviewLabel,
} from "./GrowthOperatingOverview";

const overview: GrowthOperatingOverviewDto = {
  asOf: "2026-09-02T10:00:00.000Z",
  consistency: "current_not_snapshot",
  opportunities: { count: 20, hasMore: true },
  activeWork: {
    count: 3,
    hasMore: false,
    byStatus: {
      approved: 0,
      ready: 2,
      in_progress: 0,
      blocked: 0,
      implemented: 0,
      measuring: 1,
    },
  },
  dueMeasurements: { count: 1, hasMore: false, scanState: "complete" },
  evaluatedMeasurements: {
    count: 4,
    sourceHasMore: true,
    inconsistentCount: 1,
    byOutcome: {
      strong_positive: 1,
      positive: 1,
      inconclusive: 1,
      neutral: 0,
      negative: 1,
      strong_negative: 0,
      not_measurable: 0,
    },
  },
  monthlySummary: {
    state: "published",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
  },
};

beforeEach(() => {
  query.refetch.mockReset();
  query.state = {
    isPending: false,
    isError: false,
    isFetching: false,
    data: undefined,
    refetch: query.refetch,
  };
});

describe("Growth operating overview", () => {
  it("labels bounded counts and monthly states honestly", () => {
    expect(boundedOverviewCount(20, true)).toBe("20+");
    expect(boundedOverviewCount(4, false)).toBe("4");
    expect(monthlyOverviewLabel(overview.monthlySummary)).toBe("Published");
  });

  it("renders the five operating questions and links to existing sections", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthOperatingOverviewMetrics, { data: overview }),
    );

    expect(html).toContain("20+");
    expect(html).toContain("2 ready · 1 measuring");
    expect(html).toContain(
      "2 positive · 1 negative · 1 needs review · More completed plans saved",
    );
    expect(html).toContain("Published");
    expect(html).toContain('href="#growth-opportunities"');
    expect(html).toContain('href="#growth-monthly-summary"');
  });

  it("discloses a wider completed-plan page when this page has no aligned outcomes", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthOperatingOverviewMetrics, {
        data: {
          ...overview,
          evaluatedMeasurements: {
            ...overview.evaluatedMeasurements,
            count: 0,
            inconsistentCount: 0,
            byOutcome: {
              strong_positive: 0,
              positive: 0,
              inconclusive: 0,
              neutral: 0,
              negative: 0,
              strong_negative: 0,
              not_measurable: 0,
            },
          },
        },
      }),
    );

    expect(html).toContain("No reviewed outcomes · More completed plans saved");
  });

  it("renders local loading and error states", () => {
    query.state = { ...query.state, isPending: true };
    let html = renderToStaticMarkup(
      createElement(GrowthOperatingOverview, { projectId: "project_1" }),
    );
    expect(html).toContain("Loading Growth overview");

    query.state = { ...query.state, isPending: false, isError: true };
    html = renderToStaticMarkup(
      createElement(GrowthOperatingOverview, { projectId: "project_1" }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry overview");
  });
});
