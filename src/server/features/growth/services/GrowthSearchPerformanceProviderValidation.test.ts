import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPerformance: vi.fn<(request: Record<string, unknown>) => unknown>(),
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

const collectionInput = {
  projectId: "project_acceptance",
  startDate: "2026-05-01",
  endDate: "2026-05-03",
  capturedAt: "2026-05-07T12:00:00.000Z",
};

function providerResponse(
  request: Record<string, unknown>,
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

function resetAdapterMocks() {
  mocks.getPerformance.mockReset();
  mocks.listKeyPages.mockReset().mockResolvedValue([
    {
      id: "key_page",
      projectId: collectionInput.projectId,
      url: "https://example.test/page",
      commercialWeight: null,
    },
  ]);
}

function pageRow(url: string, date: string, clicks = 1) {
  return { keys: [url, date], clicks, impressions: clicks + 1 };
}

describe("Growth GSC provider validation", () => {
  it("uses bounded pagination, distinguishing a short terminal page from cap exhaustion", async () => {
    resetAdapterMocks();
    mocks.getPerformance
      .mockImplementationOnce((request: Record<string, unknown>) =>
        providerResponse(request, [
          pageRow("https://example.test/page", "2026-05-01"),
        ]),
      )
      .mockImplementationOnce((request: Record<string, unknown>) =>
        providerResponse(request, []),
      );

    const exhausted = await collectGrowthSearchPerformance(collectionInput);
    expect(exhausted.retrievalStatus).toBe("exhausted");
    expect(
      mocks.getPerformance.mock.calls.map(([request]) => request.startRow),
    ).toEqual([0, 1]);

    resetAdapterMocks();
    mocks.getPerformance.mockImplementation(
      (request: Record<string, unknown>) =>
        providerResponse(request, [
          pageRow("https://example.test/page", "2026-05-01"),
        ]),
    );
    const capped = await collectGrowthSearchPerformance({
      ...collectionInput,
      maxPageRequests: 1,
    });
    expect(capped.retrievalStatus).toBe("capped");
  });

  it("rejects invalid source rows before curation and preserves provider errors", async () => {
    resetAdapterMocks();
    mocks.getPerformance.mockImplementationOnce(
      (request: Record<string, unknown>) =>
        providerResponse(request, [
          pageRow("https://example.test/elsewhere", "2026-05-01"),
        ]),
    );
    mocks.getPerformance.mockImplementationOnce(
      (request: Record<string, unknown>) => providerResponse(request, []),
    );
    await expect(
      collectGrowthSearchPerformance(collectionInput),
    ).resolves.toMatchObject({
      observations: [],
    });

    resetAdapterMocks();
    mocks.getPerformance.mockImplementationOnce(
      (request: Record<string, unknown>) =>
        providerResponse(request, [
          pageRow("https://example.test/elsewhere", "2026-05-04"),
        ]),
    );
    await expect(
      collectGrowthSearchPerformance(collectionInput),
    ).rejects.toThrow("outside the collection window");

    resetAdapterMocks();
    mocks.getPerformance.mockImplementationOnce(
      (request: Record<string, unknown>) =>
        providerResponse(request, [
          pageRow("https://user:secret@example.test/elsewhere", "2026-05-01"),
        ]),
    );
    await expect(
      collectGrowthSearchPerformance(collectionInput),
    ).rejects.toThrow(/embedded credentials|credential-free/);

    resetAdapterMocks();
    const sourceError = new Error("Google grant revoked");
    mocks.getPerformance.mockRejectedValueOnce(sourceError);
    await expect(collectGrowthSearchPerformance(collectionInput)).rejects.toBe(
      sourceError,
    );
  });

  it.each([
    [
      "returned filters",
      (result: ReturnType<typeof providerResponse>) => ({
        ...result,
        request: { ...result.request, aggregationType: "byPage" },
      }),
    ],
    [
      "returned dimensions",
      (result: ReturnType<typeof providerResponse>) => ({
        ...result,
        request: { ...result.request, dimensions: ["date", "page"] },
      }),
    ],
    [
      "changed property",
      (result: ReturnType<typeof providerResponse>) => ({
        ...result,
        siteUrl: "sc-domain:other.test",
      }),
    ],
  ])("rejects %s drift", async (_label, mutate) => {
    resetAdapterMocks();
    mocks.getPerformance
      .mockImplementationOnce((request: Record<string, unknown>) =>
        providerResponse(request, [
          pageRow("https://example.test/page", "2026-05-01"),
        ]),
      )
      .mockImplementationOnce((request: Record<string, unknown>) =>
        mutate(providerResponse(request, [])),
      );
    await expect(
      collectGrowthSearchPerformance(collectionInput),
    ).rejects.toThrow(/differs from collection|property changed/);
  });

  it("enforces inclusive calendar boundaries, source lag, and the 90-day allocation guard", async () => {
    resetAdapterMocks();
    await expect(
      collectGrowthSearchPerformance({
        ...collectionInput,
        startDate: "2024-02-29",
        endDate: "2024-02-29",
        capturedAt: "2024-03-03T07:59:59.000Z",
      }),
    ).rejects.toThrow("at least three Pacific calendar days");
    await expect(
      collectGrowthSearchPerformance({
        ...collectionInput,
        startDate: "2026-01-01",
        endDate: "2026-04-01",
      }),
    ).rejects.toThrow("cannot exceed 90 days");
    await expect(
      collectGrowthSearchPerformance({
        ...collectionInput,
        startDate: "2026-02-30",
      }),
    ).rejects.toThrow("valid inclusive calendar dates");
  });

  it.each([
    ["relative URL", "example.test/not-curated"],
    ["oversized URL", `https://example.test/${"a".repeat(4097)}`],
  ])("rejects a non-curated %s before discarding it", async (_label, url) => {
    resetAdapterMocks();
    mocks.getPerformance
      .mockImplementationOnce((request: Record<string, unknown>) =>
        providerResponse(request, [pageRow(url, "2026-05-01")]),
      )
      .mockImplementationOnce((request: Record<string, unknown>) =>
        providerResponse(request, []),
      );

    await expect(
      collectGrowthSearchPerformance(collectionInput),
    ).rejects.toThrow();
  });
});
