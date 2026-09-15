import { beforeEach, describe, expect, it, vi } from "vitest";

type Request = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  filters?: Array<{ dimension: string; operator: string; expression: string }>;
  rowLimit?: number;
  startRow?: number;
};

const mocks = vi.hoisted(() => ({
  getPerformance: vi.fn<(request: Request) => unknown>(),
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

import {
  collectFrozenGrowthSearchPerformance,
  collectGrowthSearchPerformance,
} from "./GrowthSearchPerformanceAdapter";

function response(input: Request) {
  return (rows: unknown[]) => ({
    siteUrl: "sc-domain:example.test",
    request: {
      ...input,
      startRow: input.startRow || undefined,
      type: "web",
      dataState: "final",
      dimensionFilterGroups: input.filters
        ? [{ groupType: "and", filters: input.filters }]
        : undefined,
    },
    rows,
  });
}

const input = {
  projectId: "project_1",
  startDate: "2026-05-01",
  endDate: "2026-05-04",
  capturedAt: "2026-05-08T12:00:00.000Z",
};

describe("collectGrowthSearchPerformance", () => {
  beforeEach(() => {
    mocks.getPerformance.mockReset();
    mocks.listKeyPages.mockReset().mockResolvedValue([
      {
        id: "key_0",
        projectId: "project_1",
        url: "https://example.test/p/0",
        commercialWeight: null,
      },
    ]);
  });

  it("uses bounded exact URL-alias queries and retains sparse date facts", async () => {
    mocks.getPerformance.mockImplementation((request: Request) =>
      response(request)([{ keys: ["2026-05-01"], clicks: 1, impressions: 1 }]),
    );

    const snapshot = await collectGrowthSearchPerformance({
      ...input,
      includeSiteContext: true,
    });

    expect(mocks.getPerformance).toHaveBeenCalledTimes(5);
    expect(
      mocks.getPerformance.mock.calls.map(
        ([request]) => request.filters?.[0]?.operator,
      ),
    ).toEqual(["equals", "equals", "equals", "equals", undefined]);
    expect(snapshot.retrievalStatus).toBe("exhausted");
    expect(snapshot.observations).toHaveLength(4);
    expect(
      snapshot.observations.every(
        (row) => row.date === "2026-05-01" && row.clicks === 1,
      ),
    ).toBe(true);
    expect(snapshot.comparisonEvidence).toEqual({
      status: "complete",
      collectionMethod: "exact_page_alias_date_inventory_v2",
      baselineWindow: { startDate: "2026-05-01", endDate: "2026-05-02" },
      currentWindow: { startDate: "2026-05-03", endDate: "2026-05-04" },
      pages: [
        {
          keyPageId: "key_0",
          aliases: [
            "http://example.test/p/0",
            "http://www.example.test/p/0",
            "https://example.test/p/0",
            "https://www.example.test/p/0",
          ],
          baseline: { reported: true, clicks: 4, impressions: 4 },
          current: { reported: false, clicks: 0, impressions: 0 },
        },
      ],
    });
  });

  it("rejects an invalid non-curated source row before narrowing", async () => {
    mocks.getPerformance.mockImplementation((request: Request) =>
      response(request)([{ keys: ["2026-05-05"], clicks: 1, impressions: 1 }]),
    );

    await expect(collectGrowthSearchPerformance(input)).rejects.toThrow(
      "outside the collection window",
    );
  });
});

describe("collectFrozenGrowthSearchPerformance", () => {
  beforeEach(() => {
    mocks.getPerformance.mockReset();
    mocks.listKeyPages.mockReset();
  });

  it("uses exact frozen URL identity without reading mutable key pages", async () => {
    mocks.getPerformance
      .mockImplementationOnce((request: Request) =>
        response(request)([
          {
            keys: ["https://example.test/pricing/", "2026-05-01"],
            clicks: 4,
            impressions: 8,
          },
          {
            keys: ["https://example.test/pricing", "2026-05-01"],
            clicks: 3,
            impressions: 6,
          },
        ]),
      )
      .mockImplementationOnce((request: Request) => response(request)([]));

    const snapshot = await collectFrozenGrowthSearchPerformance({
      ...input,
      targetUrls: ["https://example.test/pricing"],
    });

    expect(snapshot.observations).toEqual([
      {
        rawUrl: "https://example.test/pricing",
        date: "2026-05-01",
        clicks: 3,
        impressions: 6,
      },
    ]);
    expect(snapshot.requestsUsed).toBe(2);
    expect(mocks.listKeyPages).not.toHaveBeenCalled();
  });

  it("collects a frozen window longer than 90 days through bounded requests", async () => {
    const windows: Array<{ startDate: string; endDate: string }> = [];
    mocks.getPerformance.mockImplementation((request: Request) => {
      windows.push({
        startDate: request.startDate,
        endDate: request.endDate,
      });
      return response(request)([]);
    });

    await expect(
      collectFrozenGrowthSearchPerformance({
        ...input,
        startDate: "2026-01-01",
        endDate: "2026-04-01",
        capturedAt: "2026-04-04T12:00:00.000Z",
        targetUrls: ["https://example.test/pricing"],
      }),
    ).resolves.toMatchObject({
      retrievalStatus: "exhausted",
      requestsUsed: 2,
      sourceWindow: { startDate: "2026-01-01", endDate: "2026-04-01" },
    });
    expect(windows).toEqual([
      { startDate: "2026-01-01", endDate: "2026-03-31" },
      { startDate: "2026-04-01", endDate: "2026-04-01" },
    ]);
  });

  it("rejects a property change between frozen request windows", async () => {
    mocks.getPerformance
      .mockImplementationOnce((request: Request) => response(request)([]))
      .mockImplementationOnce((request: Request) => ({
        ...response(request)([]),
        siteUrl: "sc-domain:other.test",
      }));

    await expect(
      collectFrozenGrowthSearchPerformance({
        ...input,
        startDate: "2026-01-01",
        endDate: "2026-04-01",
        capturedAt: "2026-04-04T12:00:00.000Z",
        targetUrls: ["https://example.test/pricing"],
      }),
    ).rejects.toThrow("property changed during collection");
  });

  it("shares one page-request cap across frozen request windows", async () => {
    mocks.getPerformance.mockImplementation((request: Request) =>
      response(request)([]),
    );

    await expect(
      collectFrozenGrowthSearchPerformance({
        ...input,
        startDate: "2026-01-01",
        endDate: "2026-04-01",
        capturedAt: "2026-04-04T12:00:00.000Z",
        maxPageRequests: 1,
        targetUrls: ["https://example.test/pricing"],
      }),
    ).resolves.toMatchObject({ retrievalStatus: "capped", requestsUsed: 1 });
    expect(mocks.getPerformance).toHaveBeenCalledOnce();
  });

  it("rejects frozen request drift and preserves provider failures", async () => {
    mocks.getPerformance.mockImplementationOnce((request: Request) => ({
      ...response(request)([]),
      request: { ...request, dimensions: ["date", "page"] },
    }));
    await expect(
      collectFrozenGrowthSearchPerformance({
        ...input,
        targetUrls: ["https://example.test/pricing"],
      }),
    ).rejects.toThrow("differs from collection");

    mocks.getPerformance.mockReset();
    const providerError = new Error("Google grant revoked");
    mocks.getPerformance.mockRejectedValueOnce(providerError);
    await expect(
      collectFrozenGrowthSearchPerformance({
        ...input,
        targetUrls: ["https://example.test/pricing"],
      }),
    ).rejects.toBe(providerError);
  });
});
