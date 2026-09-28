import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordGrowthSignalInput } from "@/types/schemas/growth";

type SavedSignal = RecordGrowthSignalInput & { id: string };
type StrikingDecisionInput = {
  projectId: string;
  runId: string;
  signals: {
    averagePosition: SavedSignal;
    impressions: SavedSignal;
    clicks: SavedSignal;
  };
  query: string;
  page: string;
  site: string;
  commercialWeight: number | null;
};
type RunFailureInput = {
  projectId: string;
  runId: string;
  failureCode: string;
  failureMessage: string;
};

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  keyPages: vi.fn(),
  projectDomain: vi.fn(),
  getRunBySlot: vi.fn(),
  claim: vi.fn(),
  listSignals: vi.fn(),
  recordSignal:
    vi.fn<(signal: RecordGrowthSignalInput) => Promise<SavedSignal>>(),
  setAnalysisVersion: vi.fn(),
  complete: vi.fn(),
  completeErrors: vi.fn(),
  fail: vi.fn<(input: RunFailureInput) => Promise<unknown>>(),
  collect: vi.fn(),
  detect: vi.fn(),
  recordDecision:
    vi.fn<
      (
        input: StrikingDecisionInput,
      ) => Promise<{ relationship: "controller" | "suppressed" }>
    >(),
  getDecision: vi.fn(),
}));

vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: { getByProjectId: mocks.connection },
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: { listKeyPages: mocks.keyPages } }),
);
vi.mock("../repositories/GrowthRunsRepository", () => ({
  GrowthRunsRepository: { getRunBySlot: mocks.getRunBySlot },
}));
vi.mock("../repositories/GrowthInsightsRepository", () => ({
  GrowthInsightsRepository: { projectDomain: mocks.projectDomain },
}));
vi.mock("./GrowthRunsService", () => ({
  GrowthRunsService: {
    claimManualRun: mocks.claim,
    listSignals: mocks.listSignals,
    recordSignal: mocks.recordSignal,
    setAnalysisVersion: mocks.setAnalysisVersion,
    completeRun: mocks.complete,
    completeRunWithErrors: mocks.completeErrors,
    failRun: mocks.fail,
  },
}));
vi.mock("./GrowthStrikingDistanceAdapter", () => ({
  collectGrowthStrikingDistanceInventory: mocks.collect,
}));
vi.mock("./StrikingDistanceQueryDetector", () => ({
  detectStrikingDistanceQueries: mocks.detect,
  STRIKING_DISTANCE_QUERY_DETECTOR_VERSION: "striking-distance-query-v1",
}));
vi.mock("./GrowthOpportunityDecisionsService", () => ({
  GrowthOpportunityDecisionsService: {
    recordStrikingDistanceInvestigation: mocks.recordDecision,
    getDecision: mocks.getDecision,
  },
}));
vi.mock("./StrikingDistanceInvestigationTemplate", () => ({
  STRIKING_DISTANCE_INVESTIGATION_TEMPLATE_VERSION:
    "striking-distance-investigation-v1",
}));
vi.mock("./GrowthPriorityPageCheckService", () => ({
  priorityPageCheckWindows: () => ({
    baselineWindow: { startDate: "2026-07-06", endDate: "2026-08-02" },
    currentWindow: { startDate: "2026-08-03", endDate: "2026-08-30" },
  }),
}));

import { GrowthStrikingDistanceCheckService } from "./GrowthStrikingDistanceCheckService";

const running = {
  id: "run_1",
  projectId: "project_1",
  runType: "manual_analysis",
  cadenceSlot: "striking-distance-check:request_1",
  detectorVersion: "striking-distance-query-v1",
  status: "running",
  periodStart: "2026-07-06",
  periodEnd: "2026-08-30",
  startedAt: "2026-09-02T12:00:00.000Z",
  completedAt: null,
  failureCode: null,
  failureMessage: null,
};

const exhaustiveInventory = {
  baseline: { retrievalStatus: "exhausted", requestsUsed: 2, rows: [] },
  current: { retrievalStatus: "exhausted", requestsUsed: 2, rows: [] },
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.connection.mockResolvedValue({ id: "connection_1" });
  mocks.keyPages.mockResolvedValue([{ id: "page_1" }]);
  mocks.projectDomain.mockResolvedValue("bodkin.studio");
  mocks.getRunBySlot.mockResolvedValue(null);
  mocks.claim.mockResolvedValue({ run: running, claimed: true });
  mocks.listSignals.mockResolvedValue([]);
  mocks.collect.mockResolvedValue(exhaustiveInventory);
  mocks.detect.mockResolvedValue([]);
  mocks.complete.mockResolvedValue({
    ...running,
    status: "completed",
    completedAt: "2026-09-02T12:01:00.000Z",
  });
  mocks.completeErrors.mockResolvedValue({
    ...running,
    status: "completed_with_errors",
    completedAt: "2026-09-02T12:01:00.000Z",
    failureCode: "INCOMPLETE_QUERY_INVENTORY",
    failureMessage: "safe",
  });
  mocks.fail.mockResolvedValue({
    ...running,
    status: "failed",
    completedAt: "2026-09-02T12:01:00.000Z",
    failureCode: "SEARCH_CONSOLE_UNAVAILABLE",
    failureMessage: "safe",
  });
  mocks.setAnalysisVersion.mockResolvedValue(running);
  mocks.recordDecision.mockResolvedValue({ relationship: "controller" });
  mocks.getDecision.mockResolvedValue(null);
});

describe("Growth striking-distance check", () => {
  it("claims adjacent windows and completes an exhaustive empty result", async () => {
    const result = await GrowthStrikingDistanceCheckService.runCheck({
      projectId: "project_1",
      requestKey: "request_1",
    });

    expect(mocks.claim).toHaveBeenCalledWith({
      projectId: "project_1",
      runType: "manual_analysis",
      cadenceSlot: "striking-distance-check:request_1",
      periodStart: "2026-07-06",
      periodEnd: "2026-08-30",
      detectorVersion: "striking-distance-query-v1",
    });
    expect(mocks.collect).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        baselineWindow: {
          startDate: "2026-07-06",
          endDate: "2026-08-02",
        },
        currentWindow: {
          startDate: "2026-08-03",
          endDate: "2026-08-30",
        },
      }),
    );
    expect(result).toMatchObject({
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
      run: { status: "completed" },
    });
  });

  it("records three measured Signals and one controller opportunity", async () => {
    const drafts = [
      { metric: "gsc_average_position" },
      { metric: "gsc_impressions" },
      { metric: "gsc_clicks" },
    ];
    mocks.detect.mockResolvedValue([
      {
        status: "candidate",
        query: "web design bath",
        canonicalPageUrl: "https://bodkin.studio/web-design-bath",
        site: "bodkin.studio",
        commercialWeight: 5,
        signalDrafts: drafts,
      },
    ]);
    mocks.recordSignal.mockImplementation(async (signal) => ({
      ...signal,
      id: `signal_${signal.metric}`,
    }));

    const result = await GrowthStrikingDistanceCheckService.runCheck({
      projectId: "project_1",
      requestKey: "request_1",
    });

    expect(mocks.recordSignal).toHaveBeenCalledTimes(3);
    expect(mocks.recordDecision).toHaveBeenCalledOnce();
    const decisionInput = mocks.recordDecision.mock.calls[0]?.[0];
    expect(decisionInput).toMatchObject({
      projectId: "project_1",
      runId: "run_1",
      signals: {
        averagePosition: { metric: "gsc_average_position" },
        impressions: { metric: "gsc_impressions" },
        clicks: { metric: "gsc_clicks" },
      },
      query: "web design bath",
      page: "https://bodkin.studio/web-design-bath",
      site: "bodkin.studio",
      commercialWeight: 5,
    });
    expect(mocks.setAnalysisVersion).toHaveBeenCalledWith({
      projectId: "project_1",
      runId: "run_1",
      analysisVersion: "striking-distance-investigation-v1",
    });
    expect(result).toMatchObject({
      candidateCount: 1,
      savedOpportunityCount: 1,
      alreadyCoveredCount: 0,
    });
  });

  it("fails closed when either query inventory reaches its cap", async () => {
    mocks.collect.mockResolvedValue({
      baseline: { retrievalStatus: "exhausted", rows: [] },
      current: { retrievalStatus: "capped", rows: [] },
    });

    const result = await GrowthStrikingDistanceCheckService.runCheck({
      projectId: "project_1",
      requestKey: "request_1",
    });

    expect(mocks.detect).not.toHaveBeenCalled();
    expect(mocks.completeErrors).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: "INCOMPLETE_QUERY_INVENTORY" }),
    );
    expect(result.run.status).toBe("completed_with_errors");
  });

  it("replays stored decisions without reading Search Console", async () => {
    const completed = { ...running, status: "completed" };
    mocks.getRunBySlot.mockResolvedValue(completed);
    mocks.listSignals.mockResolvedValue([
      {
        id: "signal_impressions",
        signalType: "striking_distance_query",
        entityType: "search_query",
        metric: "gsc_impressions",
        evidenceKind: "gsc_period",
      },
    ]);
    mocks.getDecision.mockResolvedValue({ relationship: "suppressed" });

    const result = await GrowthStrikingDistanceCheckService.runCheck({
      projectId: "project_1",
      requestKey: "request_1",
    });

    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      replayed: true,
      candidateCount: 1,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 1,
    });
  });

  it("sanitizes source failures and never saves a candidate", async () => {
    mocks.collect.mockRejectedValue(new Error("Bearer secret-provider-data"));

    const result = await GrowthStrikingDistanceCheckService.runCheck({
      projectId: "project_1",
      requestKey: "request_1",
    });

    expect(mocks.fail).toHaveBeenCalledOnce();
    const failureInput = mocks.fail.mock.calls[0]?.[0];
    expect(failureInput?.failureCode).toBe("SEARCH_CONSOLE_UNAVAILABLE");
    expect(failureInput?.failureMessage).not.toContain("secret-provider-data");
    expect(mocks.recordSignal).not.toHaveBeenCalled();
    expect(result.run.status).toBe("failed");
  });

  it("requires the existing project setup before claiming provider work", async () => {
    mocks.connection.mockResolvedValue(null);

    await expect(
      GrowthStrikingDistanceCheckService.runCheck({
        projectId: "project_1",
        requestKey: "request_1",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("rejects a page outside the authorized project before provider work", async () => {
    mocks.keyPages.mockResolvedValue([{ id: "page_1" }]);

    await expect(
      GrowthStrikingDistanceCheckService.runCheck({
        projectId: "project_1",
        requestKey: "request_1",
        keyPageId: "page_foreign",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("limits detection and replay identity to the selected saved page", async () => {
    const selected = {
      id: "page_teams",
      projectId: "project_1",
      url: "https://example.com/teams",
      commercialWeight: 3,
    };
    mocks.keyPages.mockResolvedValue([
      selected,
      { ...selected, id: "page_other" },
    ]);

    await GrowthStrikingDistanceCheckService.runCheck({
      projectId: "project_1",
      requestKey: "request_1",
      keyPageId: "page_teams",
    });

    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        cadenceSlot: "striking-distance-check:page_teams:request_1",
      }),
    );
    expect(mocks.detect).toHaveBeenCalledWith(
      expect.objectContaining({ keyPages: [selected] }),
    );
  });
});
