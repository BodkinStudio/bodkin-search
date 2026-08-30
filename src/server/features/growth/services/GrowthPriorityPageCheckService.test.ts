import { beforeEach, describe, expect, it, vi } from "vitest";
import type { priorityPageInvestigationTemplate } from "./GrowthInvestigationTemplate";

type TemplateInput = Parameters<typeof priorityPageInvestigationTemplate>[0];

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  keyPages: vi.fn(),
  recent: vi.fn(),
  claim: vi.fn(),
  collect: vi.fn(),
  detect: vi.fn(),
  record: vi.fn(),
  complete: vi.fn(),
  completeErrors: vi.fn(),
  fail: vi.fn(),
  getRun: vi.fn(),
  listSignals: vi.fn(),
  getSignal: vi.fn(),
  getRunBySlot: vi.fn(),
  assemble: vi.fn(),
  createInsight: vi.fn(),
  createRecommendation: vi.fn(),
  setAnalysisVersion: vi.fn(),
  template: vi.fn(),
}));
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: { getByProjectId: mocks.connection },
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({ ProjectContextRepository: { listKeyPages: mocks.keyPages } }),
);
vi.mock("../repositories/GrowthRunsRepository", () => ({
  GrowthRunsRepository: {
    getSignal: mocks.getSignal,
    getRunBySlot: mocks.getRunBySlot,
  },
}));
vi.mock("./GrowthRunsService", () => ({
  GrowthRunsService: {
    listRecentRunsForDetector: mocks.recent,
    claimManualRun: mocks.claim,
    recordSignal: mocks.record,
    completeRun: mocks.complete,
    completeRunWithErrors: mocks.completeErrors,
    failRun: mocks.fail,
    setAnalysisVersion: mocks.setAnalysisVersion,
    getRun: mocks.getRun,
    listSignals: mocks.listSignals,
  },
}));
vi.mock("./GrowthSearchPerformanceAdapter", () => ({
  collectGrowthSearchPerformance: mocks.collect,
}));
vi.mock("./PriorityPageClickDeclineDetector", () => ({
  detectPriorityPageClickDeclines: mocks.detect,
  PRIORITY_PAGE_CLICK_DECLINE_DETECTOR_VERSION:
    "priority-page-click-decline-v1",
}));
vi.mock("./GrowthEvidencePacketService", () => ({
  assembleGrowthEvidencePacket: mocks.assemble,
}));
vi.mock("./GrowthInsightsService", () => ({
  GrowthInsightsService: {
    createInsight: mocks.createInsight,
    createRecommendation: mocks.createRecommendation,
  },
}));
vi.mock("./GrowthInvestigationTemplate", () => ({
  GROWTH_INVESTIGATION_TEMPLATE_VERSION: "priority-page-investigation-v1",
  priorityPageInvestigationTemplate: mocks.template,
}));

import {
  GrowthPriorityPageCheckService,
  priorityPageCheckWindows,
} from "./GrowthPriorityPageCheckService";

const running = {
  id: "run_1",
  runType: "manual_analysis",
  cadenceSlot: "priority-page-check:retry_1",
  detectorVersion: "priority-page-click-decline-v1",
  status: "running",
  periodStart: "2026-06-01",
  periodEnd: "2026-07-26",
  startedAt: "2026-08-01T00:00:00.000Z",
  completedAt: null,
  failureCode: null,
  failureMessage: null,
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.connection.mockResolvedValue({ id: "connection_1" });
  mocks.keyPages.mockResolvedValue([
    { id: "key_1", url: "https://example.test/pricing?campaign=internal#note" },
  ]);
  mocks.claim.mockResolvedValue({ run: running, claimed: true });
  mocks.recent.mockResolvedValue([]);
  mocks.getRun.mockResolvedValue(running);
  mocks.listSignals.mockResolvedValue([]);
  mocks.getRunBySlot.mockResolvedValue(null);
  mocks.createInsight.mockResolvedValue({ insight: { id: "insight_1" } });
  mocks.setAnalysisVersion.mockResolvedValue(running);
  mocks.template.mockImplementation(({ keyPage }: TemplateInput) => ({
    insight: { keyPage },
    recommendation: { keyPage },
  }));
});

describe("Growth priority-page checks", () => {
  it("uses the collected snapshot key page for a new suggestion", async () => {
    mocks.collect.mockResolvedValue({
      keyPages: [
        {
          id: "key_1",
          url: "https://example.com/snapshot-pricing",
          commercialWeight: 3,
        },
      ],
    });
    mocks.detect.mockResolvedValue([
      {
        status: "signal",
        signal: {
          id: "signal_1",
          entityRef: "key_1",
          signalType: "priority_page_click_decline",
        },
      },
    ]);
    mocks.record.mockResolvedValue({
      id: "signal_1",
      entityRef: "key_1",
    });
    mocks.complete.mockResolvedValue({ ...running, status: "completed" });
    await GrowthPriorityPageCheckService.runCheck({
      projectId: "project_1",
      requestKey: "snapshot_1",
    });
    expect(mocks.template).toHaveBeenCalledWith(
      expect.objectContaining({
        // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matcher is intentionally nested.
        keyPage: expect.objectContaining({
          url: "https://example.com/snapshot-pricing",
        }),
      }),
    );
  });
  it("labels saved count windows and uses the existing safe current-URL projection", async () => {
    mocks.listSignals.mockResolvedValue([
      {
        id: "signal_1",
        entityRef: "key_1",
        signalType: "priority_page_click_decline",
        entityType: "key_page",
        metric: "gsc_clicks",
        evidenceKind: "gsc_period",
        periodStart: "2026-06-29",
        periodEnd: "2026-07-26",
        baselineValue: 280,
        currentValue: 112,
        deltaValue: -168,
        deltaPercent: -60,
      },
    ]);
    const result = await GrowthPriorityPageCheckService.getRunDetail(
      "project_1",
      "run_1",
    );
    expect(result.signals[0]).toMatchObject({
      displayUrl: "https://example.test/pricing",
      baselinePeriod: { startDate: "2026-06-01", endDate: "2026-06-28" },
      currentPeriod: { startDate: "2026-06-29", endDate: "2026-07-26" },
    });
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("uses adjacent equal 28-day windows ending three Pacific dates before capture", () => {
    expect(priorityPageCheckWindows("2026-08-03T12:00:00.000Z")).toEqual({
      baselineWindow: { startDate: "2026-06-06", endDate: "2026-07-03" },
      currentWindow: { startDate: "2026-07-04", endDate: "2026-07-31" },
    });
  });

  it("does not call a provider for overview and reports absent setup", async () => {
    mocks.connection.mockResolvedValue(null);
    mocks.keyPages.mockResolvedValue([]);
    await expect(
      GrowthPriorityPageCheckService.getOverview("project_1"),
    ).resolves.toMatchObject({ setup: "missing_connection" });
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("persists missing observations as a limited terminal result and sanitizes provider errors", async () => {
    mocks.collect.mockResolvedValue({});
    mocks.detect.mockResolvedValue([
      {
        status: "suppressed",
        suppressionReason: "missing_observation",
        keyPageId: "key_1",
      },
    ]);
    mocks.completeErrors.mockResolvedValue({
      ...running,
      status: "completed_with_errors",
      completedAt: "2026-08-01T00:01:00.000Z",
      failureCode: "INCOMPLETE_SOURCE_DATA",
      failureMessage: "safe",
    });
    await expect(
      GrowthPriorityPageCheckService.runCheck({
        projectId: "project_1",
        requestKey: "retry_1",
      }),
    ).resolves.toMatchObject({ run: { status: "completed_with_errors" } });
    expect(mocks.completeErrors).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: "INCOMPLETE_SOURCE_DATA" }),
    );

    mocks.collect.mockRejectedValue(
      new Error("Bearer secret-provider-payload"),
    );
    mocks.fail.mockResolvedValue({
      ...running,
      status: "failed",
      completedAt: "2026-08-01T00:01:00.000Z",
      failureCode: "SEARCH_CONSOLE_UNAVAILABLE",
      failureMessage: "safe",
    });
    const failed = await GrowthPriorityPageCheckService.runCheck({
      projectId: "project_1",
      requestKey: "retry_2",
    });
    expect(failed.run.failureMessage).not.toContain("secret-provider-payload");
  });

  it("replays a duplicate claim without collecting again", async () => {
    mocks.claim.mockResolvedValue({ run: running, claimed: false });
    await expect(
      GrowthPriorityPageCheckService.runCheck({
        projectId: "project_1",
        requestKey: "retry_1",
      }),
    ).resolves.toMatchObject({ replayed: true, run: { id: "run_1" } });
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("replays an existing immutable run after setup is removed", async () => {
    mocks.getRunBySlot.mockResolvedValue(running);
    mocks.connection.mockResolvedValue(null);
    mocks.keyPages.mockResolvedValue([]);
    await expect(
      GrowthPriorityPageCheckService.runCheck({
        projectId: "project_1",
        requestKey: "retry_1",
      }),
    ).resolves.toMatchObject({ replayed: true, run: { id: "run_1" } });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it("rejects unsupported run and signal identities without provider reads", async () => {
    mocks.getRun.mockResolvedValue({ ...running, detectorVersion: "other" });
    await expect(
      GrowthPriorityPageCheckService.getRunDetail("project_1", "run_1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    mocks.getSignal.mockResolvedValue({ id: "signal_1", signalType: "other" });
    await expect(
      GrowthPriorityPageCheckService.getEvidence({
        projectId: "project_1",
        organizationId: "org_1",
        signalId: "signal_1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.collect).not.toHaveBeenCalled();
  });
});
