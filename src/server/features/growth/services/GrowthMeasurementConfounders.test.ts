import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrowthMeasurementConfounderInput } from "./GrowthMeasurementConfounders";

const repository = vi.hoisted(() => ({
  listMeasurementConfounderCandidates: vi.fn(),
}));

vi.mock("../repositories/GrowthChangeEventsRepository", () => ({
  GrowthChangeEventsRepository: repository,
}));

import { discoverGrowthMeasurementConfounders } from "./GrowthMeasurementConfounders";

const graph: GrowthMeasurementConfounderInput = {
  plan: {
    projectId: "project_1",
    baselineStart: "2026-08-01",
    measurementEnd: "2026-09-14",
    longMeasurementEnd: "2026-10-14",
  },
  implementationChangeEventId: "anchor_1",
  metrics: [
    {
      entityType: "url",
      entityKey: "https://example.com/b",
    },
    {
      entityType: "url",
      entityKey: "https://example.com/a",
    },
    {
      entityType: "url",
      entityKey: "https://example.com/a",
    },
    { entityType: "site", entityKey: "example.com" },
  ],
};

describe("discoverGrowthMeasurementConfounders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses only sorted, deduplicated frozen URL metrics and exact matched URLs", async () => {
    repository.listMeasurementConfounderCandidates.mockResolvedValue([
      {
        event: { id: "event_1", happenedAt: "2026-08-01T00:00:00.000Z" },
        matchedUrls: [
          "https://example.com/b",
          "https://example.com/a",
          "https://example.com/a/",
          "https://example.com/b?preview=1",
        ],
      },
    ]);
    await expect(discoverGrowthMeasurementConfounders(graph)).resolves.toEqual({
      state: "complete",
      candidates: [
        {
          event: { id: "event_1", happenedAt: "2026-08-01T00:00:00.000Z" },
          matchedUrls: ["https://example.com/a", "https://example.com/b"],
        },
      ],
    });
    expect(repository.listMeasurementConfounderCandidates).toHaveBeenCalledWith(
      {
        projectId: "project_1",
        urls: ["https://example.com/a", "https://example.com/b"],
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-10-15T00:00:00.000Z",
        excludedChangeEventId: "anchor_1",
        limit: 51,
      },
    );
  });

  it("reports none, overflow, and legacy unavailable without partial candidates", async () => {
    repository.listMeasurementConfounderCandidates.mockResolvedValueOnce([]);
    await expect(discoverGrowthMeasurementConfounders(graph)).resolves.toEqual({
      state: "none",
      candidates: [],
    });
    repository.listMeasurementConfounderCandidates.mockResolvedValueOnce(
      Array.from({ length: 51 }, (_, index) => ({
        event: { id: `event_${index}` },
        matchedUrls: ["https://example.com/a"],
      })),
    );
    await expect(discoverGrowthMeasurementConfounders(graph)).resolves.toEqual({
      state: "overflow",
      candidates: [],
    });
    await expect(
      discoverGrowthMeasurementConfounders({
        ...graph,
        implementationChangeEventId: null,
      }),
    ).resolves.toEqual({ state: "unavailable", candidates: [] });
    expect(
      repository.listMeasurementConfounderCandidates,
    ).toHaveBeenCalledTimes(2);
  });

  it("rejects an incomplete repository candidate", async () => {
    repository.listMeasurementConfounderCandidates.mockResolvedValue([
      { event: { id: "event_1" }, matchedUrls: [] },
    ]);
    await expect(
      discoverGrowthMeasurementConfounders(graph),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
