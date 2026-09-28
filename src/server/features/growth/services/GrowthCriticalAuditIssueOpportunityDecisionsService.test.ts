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

import { recordCriticalAuditIssueInvestigation } from "./GrowthCriticalAuditIssueOpportunityDecisionsService";
import { criticalAuditIssueIdentity } from "./NewCriticalAuditIssueDetector";

const baselineAudit = {
  id: "audit_old",
  projectId: "project",
  startUrl: "https://example.com/",
  status: "completed" as const,
  config: JSON.stringify({ maxPages: 100, lighthouseStrategy: "none" }),
  startedAt: "2026-08-01T00:00:00.000Z",
};
const currentAudit = {
  ...baselineAudit,
  id: "audit_new",
  startedAt: "2026-09-01T00:00:00.000Z",
};
const issue = {
  id: "issue_new",
  auditId: "audit_new",
  pageUrl: "https://example.com/pricing",
  issueType: "missing-title",
  severity: "critical" as const,
  detailsJson: null,
};
const signal = {
  id: "signal",
  projectId: "project",
  runId: "growth_run",
  signalType: "new_critical_audit_issue",
  entityType: "audit_issue",
  entityRef: "issue_new",
  metric: "critical_audit_issue_presence",
  severity: "critical" as const,
  confidence: 1,
  periodStart: "2026-08-01",
  periodEnd: "2026-09-01",
  baselineValue: 0,
  currentValue: 1,
  deltaValue: 1,
  deltaPercent: null,
  evidenceKind: "audit_result" as const,
  evidenceRef: "audit_result:v1:audit_old:audit_new:issue_new",
  capturedAt: "2026-09-02T00:00:00.000Z",
};
const candidate = {
  ...criticalAuditIssueIdentity(issue),
  baselineAudit,
  currentAudit,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.domain.mockResolvedValue("example.com");
  mocks.getDecision
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ relationship: "controller" });
});

describe("critical audit issue opportunity decisions", () => {
  it("writes one deterministic controller graph for the page and site", async () => {
    await expect(
      recordCriticalAuditIssueInvestigation({
        projectId: "project",
        runId: "growth_run",
        signal,
        candidate,
      }),
    ).resolves.toEqual({ relationship: "controller" });
    expect(mocks.writeDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        signalId: "signal",
        policyVersion: "new-critical-audit-issue-repeat-suppression-v1",
        actionKeyPrefix: "new-critical-audit-issue-investigation-v1:action:",
        // eslint-disable-next-line typescript-eslint/no-unsafe-assignment -- Vitest's asymmetric matcher is intentionally untyped
        recommendation: expect.objectContaining({
          title: "Investigate new critical audit issue: Missing title tag",
          targets: [
            { targetType: "site", targetValue: "example.com" },
            { targetType: "url", targetValue: "https://example.com/pricing" },
          ],
        }),
      }),
    );
  });

  it("rejects evidence that points at a different current audit", async () => {
    await expect(
      recordCriticalAuditIssueInvestigation({
        projectId: "project",
        runId: "growth_run",
        signal: {
          ...signal,
          evidenceRef: "audit_result:v1:audit_old:audit_other:issue_new",
        },
        candidate,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.writeDecision).not.toHaveBeenCalled();
  });
});
