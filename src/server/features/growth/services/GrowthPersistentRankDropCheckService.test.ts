import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRunBySlot: vi.fn(),
  configs: vi.fn(),
  recentRuns: vi.fn(),
  keywords: vi.fn(),
  snapshots: vi.fn(),
  keyPages: vi.fn(),
  domain: vi.fn(),
  claim: vi.fn(),
  listSignals: vi.fn(),
  recordSignal: vi.fn(),
  analysis: vi.fn(),
  complete: vi.fn(),
  completeErrors: vi.fn(),
  fail: vi.fn(),
  decision: vi.fn(),
  getDecision: vi.fn(),
}));

vi.mock("@/server/features/growth/repositories/GrowthRunsRepository", () => ({
  GrowthRunsRepository: { getRunBySlot: mocks.getRunBySlot },
}));
vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: {
      getConfigsForProject: mocks.configs,
      getKeywordsForConfig: mocks.keywords,
    },
  }),
);
vi.mock("@/server/features/rank-tracking/repositories/snapshotQueries", () => ({
  getRecentCompletedFullRuns: mocks.recentRuns,
  getSnapshotsForRuns: mocks.snapshots,
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: { listKeyPages: mocks.keyPages } }),
);
vi.mock(
  "@/server/features/growth/repositories/GrowthInsightsRepository",
  () => ({
    GrowthInsightsRepository: { projectDomain: mocks.domain },
  }),
);
vi.mock("./GrowthRunsService", () => ({
  GrowthRunsService: {
    claimManualRun: mocks.claim,
    listSignals: mocks.listSignals,
    recordSignal: mocks.recordSignal,
    setAnalysisVersion: mocks.analysis,
    completeRun: mocks.complete,
    completeRunWithErrors: mocks.completeErrors,
    failRun: mocks.fail,
  },
}));
vi.mock("./GrowthOpportunityDecisionsService", () => ({
  GrowthOpportunityDecisionsService: {
    recordPersistentRankDropInvestigation: mocks.decision,
    getDecision: mocks.getDecision,
  },
}));

import { GrowthPersistentRankDropCheckService } from "./GrowthPersistentRankDropCheckService";

const running = {
  id: "growth_run",
  projectId: "project",
  runType: "manual_analysis",
  trigger: "manual",
  status: "running",
  cadenceSlot: "persistent-rank-drop-check:key",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-04",
  startedAt: "2026-08-05T00:00:00.000Z",
  completedAt: null,
  detectorVersion: "persistent-tracked-rank-drop-v1",
  analysisVersion: null,
  model: null,
  promptVersion: null,
  providerCostMinor: null,
  failureCode: null,
  failureMessage: null,
};

function terminal(status = "completed") {
  return {
    ...running,
    status,
    completedAt: "2026-08-05T00:01:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRunBySlot.mockResolvedValue(null);
  mocks.configs.mockResolvedValue([
    {
      id: "config",
      domain: "example.com",
      serpDepth: 20,
      devices: "desktop",
    },
  ]);
  mocks.recentRuns.mockResolvedValue(
    [4, 3, 2, 1].map((day) => ({
      id: `rank_${day}`,
      startedAt: `2026-08-0${day}T00:00:00.000Z`,
    })),
  );
  mocks.keywords.mockResolvedValue([
    { id: "keyword", keyword: "commercial query", searchVolume: 100 },
  ]);
  mocks.snapshots.mockResolvedValue(
    [1, 2, 3, 4].map((day) => ({
      id: day,
      runId: `rank_${day}`,
      trackingKeywordId: "keyword",
      keyword: "commercial query",
      device: "desktop",
      position: day === 1 ? 4 : day + 5,
      url: "https://example.com/pricing",
      checkedAt: `2026-08-0${day}T00:00:01.000Z`,
    })),
  );
  mocks.keyPages.mockResolvedValue([
    {
      id: "page",
      projectId: "project",
      url: "https://example.com/pricing",
      commercialWeight: 5,
    },
  ]);
  mocks.domain.mockResolvedValue("example.com");
  mocks.claim.mockResolvedValue({ run: running, claimed: true });
  // eslint-disable-next-line typescript-eslint/no-unsafe-return -- the hoisted Vitest mock intentionally forwards the service-owned Signal shape
  mocks.recordSignal.mockImplementation(async (signal) => ({
    ...signal,
    id: "signal",
  }));
  mocks.decision.mockResolvedValue({ relationship: "controller" });
  mocks.complete.mockResolvedValue(terminal());
  mocks.completeErrors.mockResolvedValue(terminal("completed_with_errors"));
  mocks.fail.mockResolvedValue(terminal("failed"));
});

describe("GrowthPersistentRankDropCheckService", () => {
  it("replays a stored result without rereading rank history", async () => {
    mocks.getRunBySlot.mockResolvedValue(terminal());
    mocks.listSignals.mockResolvedValue([
      {
        id: "signal",
        signalType: "tracked_rank_drop",
        entityType: "tracked_keyword",
        metric: "organic_rank_position_floor",
        evidenceKind: "rank_snapshot",
      },
    ]);
    mocks.getDecision.mockResolvedValue({ relationship: "controller" });
    await expect(
      GrowthPersistentRankDropCheckService.runCheck({
        projectId: "project",
        requestKey: "key",
      }),
    ).resolves.toMatchObject({
      replayed: true,
      candidateCount: 1,
      savedOpportunityCount: 1,
    });
    expect(mocks.configs).not.toHaveBeenCalled();
  });

  it("records insufficient four-check history as a truthful limited result", async () => {
    mocks.recentRuns.mockResolvedValue([
      { id: "rank_1", startedAt: "2026-08-01" },
    ]);
    await expect(
      GrowthPersistentRankDropCheckService.runCheck({
        projectId: "project",
        requestKey: "key",
      }),
    ).resolves.toMatchObject({
      run: { status: "completed_with_errors" },
      candidateCount: 0,
    });
    expect(mocks.completeErrors).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: "INSUFFICIENT_RANK_HISTORY" }),
    );
    expect(mocks.recordSignal).not.toHaveBeenCalled();
  });

  it("saves one persistent drop and its deduped investigation", async () => {
    await expect(
      GrowthPersistentRankDropCheckService.runCheck({
        projectId: "project",
        requestKey: "key",
      }),
    ).resolves.toMatchObject({
      run: { status: "completed" },
      candidateCount: 1,
      savedOpportunityCount: 1,
      alreadyCoveredCount: 0,
    });
    expect(mocks.recordSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        signalType: "tracked_rank_drop",
        evidenceRef: "rank_snapshot:v1:20:1,2,3,4",
      }),
    );
    expect(mocks.decision).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project",
        runId: "growth_run",
        // eslint-disable-next-line typescript-eslint/no-unsafe-assignment -- Vitest's asymmetric matcher is intentionally untyped
        candidate: expect.objectContaining({
          keyword: "commercial query",
          device: "desktop",
        }),
      }),
    );
    expect(mocks.analysis).toHaveBeenCalled();
  });

  it("returns a limited result when any configured device history is partial", async () => {
    mocks.configs.mockResolvedValue([
      {
        id: "config",
        domain: "example.com",
        serpDepth: 20,
        devices: "both",
      },
    ]);
    await expect(
      GrowthPersistentRankDropCheckService.runCheck({
        projectId: "project",
        requestKey: "key",
      }),
    ).resolves.toMatchObject({
      run: { status: "completed_with_errors" },
      candidateCount: 0,
    });
    expect(mocks.completeErrors).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: "INCOMPLETE_RANK_HISTORY" }),
    );
    expect(mocks.recordSignal).not.toHaveBeenCalled();
  });

  it("does not claim health when no active keyword can be evaluated", async () => {
    mocks.keywords.mockResolvedValue([]);
    mocks.snapshots.mockResolvedValue([]);
    await expect(
      GrowthPersistentRankDropCheckService.runCheck({
        projectId: "project",
        requestKey: "key",
      }),
    ).resolves.toMatchObject({
      run: { status: "completed_with_errors" },
      candidateCount: 0,
    });
    expect(mocks.completeErrors).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: "NO_TRACKED_KEYWORDS" }),
    );
    expect(mocks.recordSignal).not.toHaveBeenCalled();
  });
});
