import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPerformance: vi.fn(),
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

type Request = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
};

function response(input: Request) {
  return (rows: unknown[]) => ({
    siteUrl: "sc-domain:example.test",
    request: {
      ...input,
      startRow: input.startRow || undefined,
      type: "web",
      dataState: "final",
    },
    rows,
  });
}

const input = {
  projectId: "project_1",
  startDate: "2026-05-01",
  endDate: "2026-05-03",
  capturedAt: "2026-05-07T12:00:00.000Z",
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

  it("advances by received rows, validates every raw row, and retains only curated observations", async () => {
    const requestedStartRows: number[] = [];
    const first = Array.from({ length: 1000 }, (_, index) => ({
      keys: [`https://example.test/p/${index}`, "2026-05-01"],
      clicks: 1,
      impressions: 1,
    }));
    mocks.getPerformance
      .mockImplementationOnce((request: Request) => {
        requestedStartRows.push(request.startRow ?? 0);
        return response(request)(first);
      })
      .mockImplementationOnce((request: Request) => {
        requestedStartRows.push(request.startRow ?? 0);
        return response(request)([
          {
            keys: ["https://example.test/p/1000", "2026-05-02"],
            clicks: 1,
            impressions: 1,
          },
        ]);
      })
      .mockImplementationOnce((request: Request) => {
        requestedStartRows.push(request.startRow ?? 0);
        return response(request)([]);
      });

    const snapshot = await collectGrowthSearchPerformance(input);

    expect(requestedStartRows).toEqual([0, 1000, 1001]);
    expect(snapshot.retrievalStatus).toBe("exhausted");
    expect(snapshot.observations).toEqual([
      {
        rawUrl: "https://example.test/p/0",
        date: "2026-05-01",
        clicks: 1,
        impressions: 1,
      },
    ]);
  });

  it("rejects an invalid non-curated source row before narrowing", async () => {
    mocks.getPerformance.mockImplementationOnce((request: Request) =>
      response(request)([
        {
          keys: ["https://example.test/not-curated", "2026-05-04"],
          clicks: 1,
          impressions: 1,
        },
      ]),
    );

    await expect(collectGrowthSearchPerformance(input)).rejects.toThrow(
      "outside the collection window",
    );
  });
});
