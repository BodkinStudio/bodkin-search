import { beforeEach, describe, expect, it, vi } from "vitest";

type Request = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
};

const mocks = vi.hoisted(() => ({
  getPerformance: vi.fn<(request: Request) => unknown>(),
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getPerformance: mocks.getPerformance },
}));

import { collectGrowthStrikingDistanceInventory } from "./GrowthStrikingDistanceAdapter";

const input = {
  projectId: "project_1",
  capturedAt: "2026-08-07T12:00:00.000Z",
  baselineWindow: { startDate: "2026-06-09", endDate: "2026-07-06" },
  currentWindow: { startDate: "2026-07-07", endDate: "2026-08-03" },
};

function response(
  request: Request,
  rows: unknown[],
  siteUrl = "sc-domain:example.test",
) {
  return {
    siteUrl,
    request: {
      ...request,
      startRow: request.startRow || undefined,
      type: "web",
      dataState: "final",
    },
    rows,
  };
}

const emptyRequest: Request = { startDate: "", endDate: "" };

function mockPerformance(implementation: (request: Request) => unknown) {
  mocks.getPerformance.mockImplementation((request?: Request) =>
    implementation(request ?? emptyRequest),
  );
}

const row = (
  query = "Hello   world",
  page = "http://www.example.test/pricing/",
) => ({
  keys: [query, page],
  clicks: 2,
  impressions: 55,
  ctr: 2 / 55,
  position: 7,
});

describe("collectGrowthStrikingDistanceInventory", () => {
  beforeEach(() => mocks.getPerformance.mockReset());

  it("collects adjacent final query/page inventories and normalizes coordinates", async () => {
    mockPerformance((request) =>
      response(request, request.startRow ? [] : [row()]),
    );
    const result = await collectGrowthStrikingDistanceInventory(input);
    expect(result.baseline).toMatchObject({
      retrievalStatus: "exhausted",
      requestsUsed: 2,
    });
    expect(result.current.rows).toEqual([
      expect.objectContaining({
        query: "hello world",
        page: "https://example.test/pricing/",
      }),
    ]);
    expect(mocks.getPerformance.mock.calls[0][0]).toMatchObject({
      ...input.baselineWindow,
      dimensions: ["query", "page"],
      rowLimit: 1000,
      type: "web",
      dataState: "final",
    });
  });

  it("caps after ten non-empty pages even if the final page is short", async () => {
    mockPerformance((request) =>
      response(request, [row(`query-${request.startRow ?? 0}`)]),
    );
    const result = await collectGrowthStrikingDistanceInventory(input);
    expect(result.baseline).toMatchObject({
      retrievalStatus: "capped",
      requestsUsed: 10,
    });
    expect(result.current).toMatchObject({
      retrievalStatus: "capped",
      requestsUsed: 10,
    });
    expect(
      mocks.getPerformance.mock.calls.filter(
        ([request]) => request !== undefined,
      ),
    ).toHaveLength(20);
  });

  it("advances startRow by the actual short page length", async () => {
    mockPerformance((request) =>
      response(request, request.startRow ? [] : [row("first"), row("second")]),
    );
    await collectGrowthStrikingDistanceInventory(input);
    expect(
      mocks.getPerformance.mock.calls
        .filter(([request]) => request !== undefined)
        .map(([request]) => request.startRow),
    ).toEqual([0, 2, 0, 2]);
  });

  it("treats a zero response on the tenth request as exhausted", async () => {
    mockPerformance((request) =>
      response(
        request,
        request.startRow === 9 ? [] : [row(`query-${request.startRow ?? 0}`)],
      ),
    );
    const result = await collectGrowthStrikingDistanceInventory(input);
    expect(result.baseline).toMatchObject({
      retrievalStatus: "exhausted",
      requestsUsed: 10,
    });
    expect(result.current).toMatchObject({
      retrievalStatus: "exhausted",
      requestsUsed: 10,
    });
  });

  it("reduces normalized aliases in stable raw-coordinate order", async () => {
    const aliases = [
      {
        keys: ["  Widget   Deal ", "http://www.example.test/pricing/"],
        clicks: 2,
        impressions: 3,
        ctr: 2 / 3,
        position: 8.3,
      },
      {
        keys: ["widget deal", "https://example.test/pricing/"],
        clicks: 5,
        impressions: 7,
        ctr: 5 / 7,
        position: 6.1,
      },
    ];
    const collect = async (rows: unknown[]) => {
      mocks.getPerformance.mockReset();
      mockPerformance((request) =>
        response(request, request.startRow ? [] : rows),
      );
      return collectGrowthStrikingDistanceInventory(input);
    };
    const first = await collect(aliases);
    const second = await collect(aliases.toReversed());
    expect(second).toEqual(first);
    expect(first.current.rows).toEqual([
      expect.objectContaining({
        query: "widget deal",
        page: "https://example.test/pricing/",
        clicks: 7,
        impressions: 10,
        position: 6.76,
      }),
    ]);
  });

  it("rejects invalid windows before reading the provider", async () => {
    await expect(
      collectGrowthStrikingDistanceInventory({
        ...input,
        currentWindow: { startDate: "2026-07-08", endDate: "2026-08-03" },
      }),
    ).rejects.toThrow("28 days");
    expect(mocks.getPerformance).not.toHaveBeenCalled();
  });

  it("fails closed for duplicate normalized query/page coordinates", async () => {
    mockPerformance((request) =>
      response(request, request.startRow ? [] : [row("Hi"), row("Hi")]),
    );
    await expect(collectGrowthStrikingDistanceInventory(input)).rejects.toThrow(
      "duplicate query/page",
    );
  });

  it("fails closed when the property changes across windows", async () => {
    mockPerformance((request) =>
      response(
        request,
        [],
        request.startDate === input.baselineWindow.startDate
          ? "sc-domain:a.test"
          : "sc-domain:b.test",
      ),
    );
    await expect(collectGrowthStrikingDistanceInventory(input)).rejects.toThrow(
      "property changed between",
    );
  });

  it("fails closed when the provider request drifts", async () => {
    mockPerformance((request) => ({
      ...response(request, []),
      request: {
        ...response(request, []).request,
        dimensions: ["page"],
      },
    }));
    await expect(collectGrowthStrikingDistanceInventory(input)).rejects.toThrow(
      "request that differs",
    );
  });

  it("fails closed for malformed provider rows", async () => {
    mockPerformance((request) =>
      response(request, request.startRow ? [] : [{ keys: ["query"] }]),
    );
    await expect(collectGrowthStrikingDistanceInventory(input)).rejects.toThrow(
      "malformed query/page row",
    );
  });

  it("fails closed when a provider page exceeds the requested row limit", async () => {
    mockPerformance((request) =>
      response(
        request,
        request.startRow
          ? []
          : Array.from({ length: 1_001 }, (_, index) =>
              row(`query-${index}`, `https://example.test/p/${index}`),
            ),
      ),
    );
    await expect(collectGrowthStrikingDistanceInventory(input)).rejects.toThrow(
      "more rows than requested",
    );
  });

  it("rejects a window newer than the final-data cutoff before provider reads", async () => {
    await expect(
      collectGrowthStrikingDistanceInventory({
        ...input,
        capturedAt: "2026-08-05T12:00:00.000Z",
      }),
    ).rejects.toThrow("final-data lag");
    expect(mocks.getPerformance).not.toHaveBeenCalled();
  });

  it("fails closed when the property changes within a window", async () => {
    mockPerformance((request) =>
      response(
        request,
        request.startRow ? [] : [row()],
        request.startRow ? "sc-domain:other.test" : "sc-domain:example.test",
      ),
    );
    await expect(collectGrowthStrikingDistanceInventory(input)).rejects.toThrow(
      "property changed during collection",
    );
  });
});
