import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrowthRunInspectorDto } from "@/types/schemas/growth-run-inspector";

const query = vi.hoisted(() => ({
  options: null as null | Record<string, unknown>,
  refetch: vi.fn(),
  state: {
    isPending: false,
    isError: false,
    isFetching: false,
    data: undefined as GrowthRunInspectorDto | undefined,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    query.options = options;
    return query.state;
  },
}));
vi.mock("@/serverFunctions/growthRunInspector", () => ({
  getGrowthRunInspector: vi.fn(),
}));

import {
  GrowthRunInspector,
  GrowthRunInspectorResults,
  formatGrowthRunDuration,
} from "./GrowthRunInspector";

const data: GrowthRunInspectorDto = {
  asOf: "2026-09-02T12:00:00.000Z",
  limit: 20,
  hasMore: true,
  runs: [
    {
      id: "run_1",
      runType: "manual_analysis",
      trigger: "manual",
      status: "failed",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      startedAt: "2026-09-01T00:00:00.000Z",
      completedAt: "2026-09-01T00:01:05.000Z",
      durationMs: 65_000,
      detectorVersion: "detector-v1",
      analysisVersion: "analysis-v1",
      providerCostMinor: 12,
      failure: { code: "SOURCE_FAILED", message: "Saved safe failure" },
      entities: {
        signals: 2,
        insights: 1,
        recommendations: 3,
        linkedActions: 1,
      },
    },
  ],
};

beforeEach(() => {
  query.refetch.mockReset();
  query.options = null;
  query.state = {
    isPending: false,
    isError: false,
    isFetching: false,
    data: undefined,
    refetch: query.refetch,
  };
});

describe("GrowthRunInspector", () => {
  it("keeps the native disclosure closed and the read disabled initially", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthRunInspector, { projectId: "project_1" }),
    );
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).not.toContain("<details open");
    expect(query.options).toMatchObject({ enabled: false, retry: false });
  });

  it("renders bounded history and every required diagnostic field", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthRunInspectorResults, { data }),
    );
    expect(html).toContain("Showing the latest 20 runs");
    expect(html).toContain("Manual analysis");
    expect(html).toContain("Failed");
    expect(html).toContain("run_1");
    expect(html).toContain("1m 5s");
    expect(html).toContain("detector-v1");
    expect(html).toContain("analysis-v1");
    expect(html).toContain("12 minor units");
    expect(html).toContain("SOURCE_FAILED");
    expect(html).toContain("Saved safe failure");
    expect(html).toContain("Linked Actions");
    expect(html).toContain(">3<");
  });

  it("renders empty, loading and retryable error states", () => {
    let html = renderToStaticMarkup(
      createElement(GrowthRunInspectorResults, {
        data: { ...data, hasMore: false, runs: [] },
      }),
    );
    expect(html).toContain("No Growth runs");

    query.state = { ...query.state, isPending: true };
    html = renderToStaticMarkup(
      createElement(GrowthRunInspector, { projectId: "project_1" }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading recent runs");

    query.state = { ...query.state, isPending: false, isError: true };
    html = renderToStaticMarkup(
      createElement(GrowthRunInspector, { projectId: "project_1" }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry run history");
  });

  it("formats subsecond, second, minute, hour and day durations", () => {
    expect(formatGrowthRunDuration(0)).toBe("<1s");
    expect(formatGrowthRunDuration(5_000)).toBe("5s");
    expect(formatGrowthRunDuration(65_000)).toBe("1m 5s");
    expect(formatGrowthRunDuration(3_660_000)).toBe("1h 1m");
    expect(formatGrowthRunDuration(90_000_000)).toBe("1d 1h");
  });
});
