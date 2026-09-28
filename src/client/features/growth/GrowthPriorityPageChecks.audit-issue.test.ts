import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  click,
  harness,
  renderCriticalAuditIssueCheck,
  resetHarness,
  teardownHarness,
  textContent,
} from "./GrowthPriorityPageChecksTestHarness";

const run = {
  id: "audit_check",
  status: "completed" as const,
  periodStart: "2026-08-01",
  periodEnd: "2026-09-01",
  startedAt: "2026-09-02T00:00:00.000Z",
  completedAt: "2026-09-02T00:01:00.000Z",
  failureCode: null,
  failureMessage: null,
};

describe("Growth critical audit issue check states", () => {
  beforeEach(resetHarness);
  afterEach(teardownHarness);

  it("uses saved audits without requiring Search Console or key pages", () => {
    harness.setup = "missing_connection";
    const ready = renderCriticalAuditIssueCheck();
    expect(textContent(ready)).toContain("same crawl start and page limit");
    expect(textContent(ready)).toContain(
      "does not run or charge for a new audit",
    );
    click(ready, "Find new critical issues");
    expect(harness.criticalAuditIssueMutate).toHaveBeenCalledWith("request_1");
    expect(
      harness.storage.get("growth:critical-audit-issue-check:project_1"),
    ).toBe("request_1");
  });

  it("reports saved and insufficient-history results", () => {
    renderCriticalAuditIssueCheck();
    harness.criticalAuditIssueMutation?.onSuccess({
      run,
      replayed: false,
      candidateCount: 2,
      savedOpportunityCount: 1,
      alreadyCoveredCount: 1,
    });
    let html = renderToStaticMarkup(renderCriticalAuditIssueCheck());
    expect(html).toContain(
      "Found 2 new critical audit issues. Newly saved: 1. Already covered: 1.",
    );
    expect(html).toContain('href="#growth-opportunities"');

    harness.criticalAuditIssueMutation?.onSuccess({
      run: {
        ...run,
        status: "completed_with_errors",
        failureCode: "INSUFFICIENT_COMPARABLE_AUDITS",
        failureMessage:
          "Two completed audits with the same crawl start and page limit are needed.",
      },
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    });
    html = renderToStaticMarkup(renderCriticalAuditIssueCheck());
    expect(html).toContain("Two completed audits");
    expect(html).toContain('role="alert"');
  });
});
