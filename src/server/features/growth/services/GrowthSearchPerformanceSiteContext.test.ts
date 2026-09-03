import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSearchAnalyticsRequest,
  type GscPerformanceInput,
} from "@/server/features/gsc/searchAnalytics";

const mocks = vi.hoisted(() => ({
  getPerformance: vi.fn<(request: GscPerformanceInput) => unknown>(),
  listKeyPages: vi.fn(),
}));

vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getPerformance: mocks.getPerformance },
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({
    ProjectContextRepository: { listKeyPages: mocks.listKeyPages },
  }),
);

import { collectGrowthSearchPerformance } from "./GrowthSearchPerformanceAdapter";

const input = {
  projectId: "project_site_context",
  startDate: "2026-05-01",
  endDate: "2026-05-04",
  capturedAt: "2026-05-08T12:00:00.000Z",
};
const pageUrl = "https://example.test/pricing";
const siteUrl = "sc-domain:example.test";
const dates = ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04"];
const siteRows = dates.map((date, index) => ({
  keys: [date],
  clicks: 1000 - index * 100,
  impressions: 2000,
}));

function response(request: GscPerformanceInput, rows: unknown[]) {
  return {
    siteUrl,
    connectedBy: "private-connector@example.test",
    request: buildSearchAnalyticsRequest(request, new Date(input.capturedAt)),
    rows,
  };
}

function pageResponse(request: GscPerformanceInput) {
  return response(
    request,
    request.startRow
      ? []
      : dates.map((date) => ({
          keys: [pageUrl, date],
          clicks: 1,
          impressions: 5,
        })),
  );
}

describe("Growth GSC site-context collection", () => {
  beforeEach(() => {
    mocks.getPerformance.mockReset();
    mocks.listKeyPages.mockReset().mockResolvedValue([
      {
        id: "key_pricing",
        projectId: input.projectId,
        url: pageUrl,
        commercialWeight: 3,
      },
    ]);
  });

  it("collects separate property totals only on explicit opt-in", async () => {
    mocks.getPerformance.mockImplementation((request: GscPerformanceInput) =>
      request.filters
        ? response(request, siteRows)
        : response(request, siteRows),
    );

    const snapshot = await collectGrowthSearchPerformance({
      ...input,
      includeSiteContext: true,
    });

    expect(
      mocks.getPerformance.mock.calls.map(([request]) => request.dimensions),
    ).toEqual([["date"], ["date"], ["date"], ["date"], ["date"]]);
    expect(mocks.getPerformance).toHaveBeenLastCalledWith({
      projectId: input.projectId,
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: ["date"],
      rowLimit: 1000,
      type: "web",
      dataState: "final",
    });
    expect(snapshot.siteContext).toEqual({
      status: "complete",
      coverage: "sparse_date_inventory_v2",
      observations: dates.map((date, index) => ({
        date,
        clicks: 1000 - index * 100,
        impressions: 2000,
      })),
    });
    expect(snapshot.observations.map((row) => row.clicks)).toEqual([
      1000, 900, 800, 700, 1000, 900, 800, 700, 1000, 900, 800, 700, 1000, 900,
      800, 700,
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("private-connector");
  });

  it("does not make a site-total query by default", async () => {
    mocks.getPerformance.mockImplementation((request: GscPerformanceInput) =>
      request.filters ? response(request, siteRows) : pageResponse(request),
    );

    const snapshot = await collectGrowthSearchPerformance(input);

    expect(snapshot.siteContext).toEqual({ status: "absent" });
    expect(mocks.getPerformance).toHaveBeenCalledTimes(4);
    expect(mocks.listKeyPages).toHaveBeenCalledWith(input.projectId);
  });

  it("records incomplete requested context without inventing the absent date", async () => {
    mocks.getPerformance.mockImplementation((request: GscPerformanceInput) =>
      request.filters
        ? response(request, siteRows)
        : response(request, [siteRows[0], siteRows[2]]),
    );

    const snapshot = await collectGrowthSearchPerformance({
      ...input,
      includeSiteContext: true,
    });

    expect(snapshot.siteContext).toMatchObject({
      status: "complete",
      coverage: "sparse_date_inventory_v2",
      observations: [siteRows[0], siteRows[2]].map(
        ({ keys: _keys, ...row }) => row,
      ),
    });
  });

  it("marks an empty validated site inventory complete", async () => {
    mocks.getPerformance.mockImplementation((request: GscPerformanceInput) =>
      request.filters ? response(request, siteRows) : response(request, []),
    );
    await expect(
      collectGrowthSearchPerformance({ ...input, includeSiteContext: true }),
    ).resolves.toMatchObject({
      siteContext: {
        status: "complete",
        coverage: "sparse_date_inventory_v2",
        observations: [],
      },
    });
  });

  it.each([
    ["duplicate date", [siteRows[0], siteRows[0]]],
    ["out-of-window date", [{ ...siteRows[0], keys: ["2026-05-05"] }]],
    ["negative clicks", [{ ...siteRows[0], clicks: -1 }]],
  ])("rejects malformed site totals: %s", async (_label, rows) => {
    mocks.getPerformance.mockImplementation((request: GscPerformanceInput) =>
      request.filters ? response(request, siteRows) : response(request, rows),
    );

    await expect(
      collectGrowthSearchPerformance({ ...input, includeSiteContext: true }),
    ).rejects.toThrow();
  });

  it("rejects a property change during the optional query", async () => {
    mocks.getPerformance.mockImplementation((request: GscPerformanceInput) =>
      request.filters
        ? response(request, siteRows)
        : { ...response(request, siteRows), siteUrl: "sc-domain:other.test" },
    );

    await expect(
      collectGrowthSearchPerformance({ ...input, includeSiteContext: true }),
    ).rejects.toThrow("property changed during site collection");
  });

  it("preserves a provider error from the optional query", async () => {
    const error = new Error("Test provider unavailable");
    mocks.getPerformance.mockImplementation((request: GscPerformanceInput) => {
      if (!request.filters) throw error;
      return response(request, siteRows);
    });

    await expect(
      collectGrowthSearchPerformance({ ...input, includeSiteContext: true }),
    ).rejects.toBe(error);
  });
});
