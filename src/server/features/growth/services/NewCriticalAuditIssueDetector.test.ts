import { describe, expect, it } from "vitest";
import {
  criticalAuditIssueIdentity,
  detectNewCriticalAuditIssues,
  findComparableAuditPair,
  parseNewCriticalAuditIssueEvidenceRef,
} from "./NewCriticalAuditIssueDetector";

const baselineAudit = {
  id: "audit_old",
  projectId: "project",
  startUrl: "http://www.example.com/",
  status: "completed" as const,
  config: JSON.stringify({ maxPages: 100, lighthouseStrategy: "none" }),
  startedAt: "2026-08-01 10:00:00",
};
const currentAudit = {
  ...baselineAudit,
  id: "audit_new",
  startUrl: "https://example.com/",
  config: JSON.stringify({ maxPages: 100, lighthouseStrategy: "auto" }),
  startedAt: "2026-09-01T10:00:00.000Z",
};
function issue(
  id: string,
  auditId: string,
  pageUrl: string,
  issueType = "missing-title",
  detailsJson: string | null = null,
) {
  return {
    id,
    auditId,
    pageUrl,
    issueType,
    severity: "critical" as const,
    detailsJson,
  };
}

describe("NewCriticalAuditIssueDetector", () => {
  it("chooses the latest completed audit and its latest compatible predecessor", () => {
    const incompatible = {
      ...baselineAudit,
      id: "audit_mid",
      config: JSON.stringify({ maxPages: 200, lighthouseStrategy: "none" }),
      startedAt: "2026-08-20T10:00:00.000Z",
    };
    expect(
      findComparableAuditPair([baselineAudit, currentAudit, incompatible]),
    ).toEqual({ current: currentAudit, baseline: baselineAudit });
  });

  it("treats a broken-link target as part of stable issue identity", () => {
    const first = criticalAuditIssueIdentity(
      issue(
        "one",
        "audit",
        "https://example.com/source",
        "broken-internal-link",
        JSON.stringify({
          targetUrl: "https://EXAMPLE.com/missing#top",
          targetStatus: 404,
        }),
      ),
    );
    const second = criticalAuditIssueIdentity(
      issue(
        "two",
        "audit",
        "https://example.com/source",
        "broken-internal-link",
        JSON.stringify({
          targetUrl: "https://example.com/other",
          targetStatus: 500,
        }),
      ),
    );
    expect(first.targetUrl).toBe("https://example.com/missing");
    expect(first.stableKey).not.toBe(second.stableKey);
  });

  it("returns only new, unique critical issues with bounded deterministic signals", () => {
    const shared = issue(
      "shared_old",
      baselineAudit.id,
      "https://example.com/about",
    );
    const result = detectNewCriticalAuditIssues({
      projectId: "project",
      runId: "growth_run",
      capturedAt: "2026-09-02T00:00:00.000Z",
      baselineAudit,
      currentAudit,
      baselineIssues: [shared],
      currentIssues: [
        { ...shared, id: "shared_new", auditId: currentAudit.id },
        issue("new_2", currentAudit.id, "https://example.com/pricing"),
        issue("new_1", currentAudit.id, "https://example.com/contact"),
        issue(
          "new_1_duplicate",
          currentAudit.id,
          "https://example.com/contact",
        ),
        issue("new_3", currentAudit.id, "https://example.com/z"),
        issue("new_4", currentAudit.id, "https://example.com/zz"),
      ],
    });
    expect(result).toHaveLength(3);
    expect(result.map(({ pageUrl }) => pageUrl)).toEqual([
      "https://example.com/contact",
      "https://example.com/pricing",
      "https://example.com/z",
    ]);
    expect(result[0].signal).toMatchObject({
      signalType: "new_critical_audit_issue",
      metric: "critical_audit_issue_presence",
      baselineValue: 0,
      currentValue: 1,
      deltaValue: 1,
      evidenceKind: "audit_result",
      evidenceRef: "audit_result:v1:audit_old:audit_new:new_1",
    });
    expect(
      parseNewCriticalAuditIssueEvidenceRef(result[0].signal.evidenceRef),
    ).toEqual({
      baselineAuditId: "audit_old",
      currentAuditId: "audit_new",
      issueId: "new_1",
    });
  });

  it("fails closed when broken-link evidence is malformed", () => {
    expect(() =>
      detectNewCriticalAuditIssues({
        projectId: "project",
        runId: "growth_run",
        capturedAt: "2026-09-02T00:00:00.000Z",
        baselineAudit,
        currentAudit,
        baselineIssues: [],
        currentIssues: [
          issue(
            "broken",
            currentAudit.id,
            "https://example.com/source",
            "broken-internal-link",
            "{}",
          ),
        ],
      }),
    ).toThrow("Broken-link audit target is invalid");
  });
});
