import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  domain: vi.fn(),
  getDecision: vi.fn(),
  writeDecision: vi.fn(),
}));
vi.mock("../repositories/GrowthInsightsRepository", () => ({
  GrowthInsightsRepository: { projectDomain: mocks.domain },
}));
vi.mock("../repositories/GrowthOpportunityDecisionsRepository", () => ({
  GrowthOpportunityDecisionsRepository: {
    getSignalDecision: mocks.getDecision,
    writeDecision: mocks.writeDecision,
  },
}));

import { recordPersistentRankDropInvestigation } from "./GrowthPersistentRankDropOpportunityDecisionsService";

const snapshots = [4, 8, 9, null].map((position, index) => ({
  id: index + 1,
  runId: `rank_${index + 1}`,
  checkedAt: `2026-08-${String(1 + index * 7).padStart(2, "0")}T00:00:00.000Z`,
  position,
  url: "https://example.com/pricing",
}));
const signal = {
  id: "signal_1",
  projectId: "project_1",
  runId: "run_1",
  signalType: "tracked_rank_drop",
  entityType: "tracked_keyword",
  entityRef: "keyword_1",
  metric: "organic_rank_position_floor",
  severity: "critical" as const,
  confidence: 0.9,
  periodStart: "2026-08-01",
  periodEnd: "2026-08-22",
  baselineValue: 4,
  currentValue: 21,
  deltaValue: 17,
  deltaPercent: 425,
  evidenceKind: "rank_snapshot" as const,
  evidenceRef: "rank_snapshot:v1:20:1,2,3,4",
  capturedAt: "2026-09-01T00:00:00.000Z",
};
const candidate = {
  configId: "config_1",
  domain: "example.com",
  trackingKeywordId: "keyword_1",
  keyword: "commercial query",
  device: "desktop" as const,
  priorityPageUrl: "https://example.com/pricing",
  commercialWeight: 5,
  serpDepth: 20,
  snapshots,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.domain.mockResolvedValue("example.com");
  mocks.getDecision
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ relationship: "controller" });
});

describe("persistent rank-drop opportunity decisions", () => {
  it("writes one deterministic controller graph with keyword/page/site targets", async () => {
    await expect(
      recordPersistentRankDropInvestigation({
        projectId: "project_1",
        runId: "run_1",
        signal,
        candidate,
      }),
    ).resolves.toEqual({ relationship: "controller" });
    expect(mocks.writeDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        signalId: "signal_1",
        policyVersion: "persistent-rank-drop-repeat-suppression-v1",
        actionKeyPrefix:
          "persistent-tracked-rank-drop-investigation-v1:action:",
        // eslint-disable-next-line typescript-eslint/no-unsafe-assignment -- Vitest's asymmetric matcher is intentionally untyped
        insight: expect.objectContaining({ signalIds: ["signal_1"] }),
        // eslint-disable-next-line typescript-eslint/no-unsafe-assignment -- Vitest's asymmetric matcher is intentionally untyped
        recommendation: expect.objectContaining({
          title: "Investigate a persistent tracked-rank drop",
          // eslint-disable-next-line typescript-eslint/no-unsafe-assignment -- Vitest's asymmetric matcher is intentionally untyped
          targets: expect.arrayContaining([
            { targetType: "keyword", targetValue: "commercial query" },
            { targetType: "url", targetValue: "https://example.com/pricing" },
            { targetType: "site", targetValue: "example.com" },
          ]),
        }),
      }),
    );
  });

  it("rejects a Signal whose direct snapshot references drift from the candidate", async () => {
    await expect(
      recordPersistentRankDropInvestigation({
        projectId: "project_1",
        runId: "run_1",
        signal: { ...signal, evidenceRef: "rank_snapshot:v1:20:1,2,3,5" },
        candidate,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.writeDecision).not.toHaveBeenCalled();
  });
});
