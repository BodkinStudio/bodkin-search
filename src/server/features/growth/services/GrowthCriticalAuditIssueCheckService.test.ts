import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRunBySlot: vi.fn(),
  audits: vi.fn(),
  issues: vi.fn(),
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
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getAuditsByProject: mocks.audits,
    getIssuesForAudit: mocks.issues,
  },
}));
vi.mock(
  "@/server/features/growth/repositories/GrowthInsightsRepository",
  () => ({ GrowthInsightsRepository: { projectDomain: mocks.domain } }),
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
    recordCriticalAuditIssueInvestigation: mocks.decision,
    getDecision: mocks.getDecision,
  },
}));

import { GrowthCriticalAuditIssueCheckService } from "./GrowthCriticalAuditIssueCheckService";

const running = {
  id: "growth_run",
  projectId: "project",
  runType: "manual_analysis",
  trigger: "manual",
  status: "running",
  cadenceSlot: "critical-audit-issue-check:key",
  periodStart: "2026-08-01",
  periodEnd: "2026-09-01",
  startedAt: "2026-09-02T00:00:00.000Z",
  completedAt: null,
  detectorVersion: "new-critical-audit-issue-v1",
  analysisVersion: null,
  model: null,
  promptVersion: null,
  providerCostMinor: null,
  failureCode: null,
  failureMessage: null,
};
const terminal = (status = "completed") => ({
  ...running,
  status,
  completedAt: "2026-09-02T00:01:00.000Z",
});
const audit = (id: string, startedAt: string, maxPages = 100) => ({
  id,
  projectId: "project",
  startUrl: "https://example.com/",
  status: "completed",
  config: JSON.stringify({ maxPages, lighthouseStrategy: "none" }),
  startedAt,
});
const newIssue = {
  id: "issue_new",
  auditId: "audit_new",
  pageUrl: "https://example.com/pricing",
  issueType: "missing-title",
  severity: "critical",
  detailsJson: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRunBySlot.mockResolvedValue(null);
  mocks.domain.mockResolvedValue("example.com");
  mocks.audits.mockResolvedValue([
    audit("audit_new", "2026-09-01T00:00:00.000Z"),
    audit("audit_old", "2026-08-01T00:00:00.000Z"),
  ]);
  mocks.issues.mockImplementation(async (auditId: string) =>
    auditId === "audit_new" ? [newIssue] : [],
  );
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

describe("GrowthCriticalAuditIssueCheckService", () => {
  it("saves a new critical issue from two compatible saved audits", async () => {
    await expect(
      GrowthCriticalAuditIssueCheckService.runCheck({
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
        signalType: "new_critical_audit_issue",
        evidenceRef: "audit_result:v1:audit_old:audit_new:issue_new",
      }),
    );
    expect(mocks.decision).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project",
        runId: "growth_run",
        // eslint-disable-next-line typescript-eslint/no-unsafe-assignment -- Vitest's asymmetric matcher is intentionally untyped
        candidate: expect.objectContaining({
          issueType: "missing-title",
          pageUrl: "https://example.com/pricing",
        }),
      }),
    );
    expect(mocks.issues).toHaveBeenCalledWith("audit_old", {
      severity: "critical",
    });
    expect(mocks.issues).toHaveBeenCalledWith("audit_new", {
      severity: "critical",
    });
  });

  it("returns a limited result when no prior compatible audit exists", async () => {
    mocks.audits.mockResolvedValue([
      audit("audit_new", "2026-09-01T00:00:00.000Z"),
      audit("audit_old", "2026-08-01T00:00:00.000Z", 200),
    ]);
    await expect(
      GrowthCriticalAuditIssueCheckService.runCheck({
        projectId: "project",
        requestKey: "key",
      }),
    ).resolves.toMatchObject({
      run: { status: "completed_with_errors" },
      candidateCount: 0,
    });
    expect(mocks.completeErrors).toHaveBeenCalledWith(
      expect.objectContaining({
        failureCode: "INSUFFICIENT_COMPARABLE_AUDITS",
      }),
    );
    expect(mocks.issues).not.toHaveBeenCalled();
  });

  it("replays a stored result without rereading audits", async () => {
    mocks.getRunBySlot.mockResolvedValue(terminal());
    mocks.listSignals.mockResolvedValue([
      {
        id: "signal",
        signalType: "new_critical_audit_issue",
        entityType: "audit_issue",
        metric: "critical_audit_issue_presence",
        evidenceKind: "audit_result",
      },
    ]);
    mocks.getDecision.mockResolvedValue({ relationship: "suppressed" });
    await expect(
      GrowthCriticalAuditIssueCheckService.runCheck({
        projectId: "project",
        requestKey: "key",
      }),
    ).resolves.toMatchObject({
      replayed: true,
      candidateCount: 1,
      alreadyCoveredCount: 1,
    });
    expect(mocks.audits).not.toHaveBeenCalled();
  });
});
