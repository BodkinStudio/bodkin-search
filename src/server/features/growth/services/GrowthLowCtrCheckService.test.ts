import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  pages: vi.fn(),
  domain: vi.fn(),
  slot: vi.fn(),
  claim: vi.fn(),
  collect: vi.fn(),
  detect: vi.fn(),
  record: vi.fn(),
  decision: vi.fn(),
  getDecision: vi.fn(),
  complete: vi.fn(),
  completeErrors: vi.fn(),
  fail: vi.fn(),
  analysis: vi.fn(),
  signals: vi.fn(),
}));
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: { getByProjectId: mocks.connection },
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: { listKeyPages: mocks.pages } }),
);
vi.mock("../repositories/GrowthInsightsRepository", () => ({
  GrowthInsightsRepository: { projectDomain: mocks.domain },
}));
vi.mock("../repositories/GrowthRunsRepository", () => ({
  GrowthRunsRepository: { getRunBySlot: mocks.slot },
}));
vi.mock("./GrowthRunsService", () => ({
  GrowthRunsService: {
    claimManualRun: mocks.claim,
    listSignals: mocks.signals,
    recordSignal: mocks.record,
    completeRun: mocks.complete,
    completeRunWithErrors: mocks.completeErrors,
    failRun: mocks.fail,
    setAnalysisVersion: mocks.analysis,
  },
}));
vi.mock("./GrowthStrikingDistanceAdapter", () => ({
  collectGrowthStrikingDistanceInventory: mocks.collect,
}));
vi.mock("./HighImpressionLowCtrDetector", () => ({
  HIGH_IMPRESSION_LOW_CTR_DETECTOR_VERSION: "high-impression-low-ctr-v1",
  detectHighImpressionLowCtrQueries: mocks.detect,
}));
vi.mock("./GrowthInvestigationTemplate", () => ({
  LOW_CTR_INVESTIGATION_TEMPLATE_VERSION:
    "high-impression-low-ctr-investigation-v1",
}));
vi.mock("./GrowthOpportunityDecisionsService", () => ({
  GrowthOpportunityDecisionsService: {
    recordLowCtrInvestigation: mocks.decision,
    getDecision: mocks.getDecision,
  },
}));
vi.mock("./GrowthPriorityPageCheckService", () => ({
  priorityPageCheckWindows: () => ({
    baselineWindow: { startDate: "2026-07-01", endDate: "2026-07-28" },
    currentWindow: { startDate: "2026-07-29", endDate: "2026-08-25" },
  }),
}));
import { GrowthLowCtrCheckService } from "./GrowthLowCtrCheckService";
const running = {
  id: "run",
  projectId: "project",
  runType: "manual_analysis",
  cadenceSlot: "low-ctr-check:key",
  detectorVersion: "high-impression-low-ctr-v1",
  status: "running",
  periodStart: "2026-07-01",
  periodEnd: "2026-08-25",
  startedAt: "2026-09-01T00:00:00.000Z",
  completedAt: null,
  failureCode: null,
  failureMessage: null,
};
const inventory = {
  baseline: { retrievalStatus: "exhausted", rows: [] },
  current: { retrievalStatus: "exhausted", rows: [] },
};
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.connection.mockResolvedValue({});
  mocks.pages.mockResolvedValue([
    {
      id: "page",
      projectId: "project",
      url: "https://example.com/page",
      commercialWeight: 1,
    },
  ]);
  mocks.domain.mockResolvedValue("example.com");
  mocks.slot.mockResolvedValue(null);
  mocks.claim.mockResolvedValue({ run: running, claimed: true });
  mocks.collect.mockResolvedValue(inventory);
  mocks.detect.mockResolvedValue([]);
  mocks.complete.mockResolvedValue({ ...running, status: "completed" });
  mocks.completeErrors.mockResolvedValue({
    ...running,
    status: "completed_with_errors",
  });
  mocks.fail.mockResolvedValue({ ...running, status: "failed" });
  mocks.record.mockImplementation(async (signal: { metric: string }) => ({
    ...signal,
    id: `signal_${signal.metric}`,
  }));
  mocks.decision.mockResolvedValue({ relationship: "controller" });
  mocks.getDecision.mockResolvedValue(null);
  mocks.signals.mockResolvedValue([]);
});
describe("Growth low-CTR check", () => {
  it("claims the separate slot and completes an exhaustive empty scan", async () => {
    const result = await GrowthLowCtrCheckService.runCheck({
      projectId: "project",
      requestKey: "key",
    });
    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        cadenceSlot: "low-ctr-check:key",
        detectorVersion: "high-impression-low-ctr-v1",
      }),
    );
    expect(result).toMatchObject({
      candidateCount: 0,
      run: { status: "completed" },
    });
  });
  it("replays stored controllers without provider work", async () => {
    mocks.slot.mockResolvedValue({ ...running, status: "completed" });
    mocks.signals.mockResolvedValue([
      {
        id: "ctr",
        signalType: "ctr_below_expected",
        entityType: "search_query",
        metric: "gsc_ctr",
        evidenceKind: "gsc_period",
      },
    ]);
    mocks.getDecision.mockResolvedValue({ relationship: "suppressed" });
    const result = await GrowthLowCtrCheckService.runCheck({
      projectId: "project",
      requestKey: "key",
    });
    expect(mocks.collect).not.toHaveBeenCalled();
    expect(result).toMatchObject({ replayed: true, alreadyCoveredCount: 1 });
  });
  it("requires Search Console and configured key pages before claiming work", async () => {
    mocks.connection.mockResolvedValue(null);
    await expect(
      GrowthLowCtrCheckService.runCheck({
        projectId: "project",
        requestKey: "key",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.claim).not.toHaveBeenCalled();

    mocks.connection.mockResolvedValue({});
    mocks.pages.mockResolvedValue([]);
    await expect(
      GrowthLowCtrCheckService.runCheck({
        projectId: "project",
        requestKey: "next",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("reports capped inventories and provider failures without saving suggestions", async () => {
    mocks.collect.mockResolvedValue({
      baseline: { retrievalStatus: "capped", rows: [] },
      current: { retrievalStatus: "exhausted", rows: [] },
    });
    const capped = await GrowthLowCtrCheckService.runCheck({
      projectId: "project",
      requestKey: "capped",
    });
    expect(capped.run.status).toBe("completed_with_errors");
    expect(mocks.detect).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();

    mocks.collect.mockRejectedValue(new Error("Bearer provider-secret"));
    const failed = await GrowthLowCtrCheckService.runCheck({
      projectId: "project",
      requestKey: "provider-failure",
    });
    expect(failed.run.status).toBe("failed");
    expect(mocks.fail).toHaveBeenLastCalledWith(
      expect.objectContaining({ failureCode: "SEARCH_CONSOLE_UNAVAILABLE" }),
    );
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("saves a first controller from four facts and counts a suppressed repeat as already covered", async () => {
    mocks.detect.mockResolvedValue([
      {
        status: "candidate",
        query: "query",
        canonicalPageUrl: "https://example.com/page",
        site: "example.com",
        commercialWeight: 1,
        signalDrafts: [
          "gsc_ctr",
          "gsc_clicks",
          "gsc_impressions",
          "gsc_average_position",
        ].map((metric) => ({ metric })),
      },
    ]);
    mocks.decision.mockResolvedValueOnce({ relationship: "controller" });
    const saved = await GrowthLowCtrCheckService.runCheck({
      projectId: "project",
      requestKey: "first",
    });
    expect(mocks.record).toHaveBeenCalledTimes(4);
    const decisionInput: unknown = mocks.decision.mock.calls[0]?.[0];
    expect(decisionInput).toMatchObject({
      signals: {
        ctr: { metric: "gsc_ctr" },
        clicks: { metric: "gsc_clicks" },
        impressions: { metric: "gsc_impressions" },
        averagePosition: { metric: "gsc_average_position" },
      },
    });
    expect(saved).toMatchObject({
      savedOpportunityCount: 1,
      alreadyCoveredCount: 0,
      run: { status: "completed" },
    });

    mocks.decision.mockResolvedValue({ relationship: "suppressed" });
    const repeated = await GrowthLowCtrCheckService.runCheck({
      projectId: "project",
      requestKey: "repeat",
    });
    expect(repeated).toMatchObject({
      savedOpportunityCount: 0,
      alreadyCoveredCount: 1,
      run: { status: "completed" },
    });
  });
  it("re-reads a committed controller after a later error and otherwise fails", async () => {
    mocks.detect.mockResolvedValue([
      {
        status: "candidate",
        query: "query",
        canonicalPageUrl: "https://example.com/page",
        site: "example.com",
        commercialWeight: 1,
        signalDrafts: [
          "gsc_ctr",
          "gsc_clicks",
          "gsc_impressions",
          "gsc_average_position",
        ].map((metric) => ({ metric })),
      },
    ]);
    mocks.decision.mockRejectedValueOnce(new Error("post-commit"));
    mocks.getDecision.mockResolvedValue({ relationship: "controller" });
    const durable = await GrowthLowCtrCheckService.runCheck({
      projectId: "project",
      requestKey: "key",
    });
    expect(mocks.getDecision).toHaveBeenCalledWith(
      "project",
      "run",
      "signal_gsc_ctr",
    );
    expect(durable.run.status).toBe("completed_with_errors");
    mocks.decision.mockRejectedValueOnce(new Error("no commit"));
    mocks.getDecision.mockResolvedValue(null);
    const failed = await GrowthLowCtrCheckService.runCheck({
      projectId: "project",
      requestKey: "next",
    });
    expect(failed.run.status).toBe("failed");
  });
});
