import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { GrowthInvestigationView } from "@/types/schemas/growth-investigations";
import { GrowthInvestigationReview } from "./GrowthInvestigation";

vi.mock("@/serverFunctions/growthInvestigations", () => ({
  getGrowthInvestigation: vi.fn(),
  approveGrowthInvestigation: vi.fn(),
  reviewGrowthInvestigation: vi.fn(),
}));

describe("critical audit issue investigation evidence", () => {
  it("shows the saved audit dates, affected page, and broken target", () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryOnMount: false, staleTime: Infinity },
      },
    });
    client.setQueryData(["growthInvestigation", "project_1", "signal_1"], {
      relationship: "controller",
      recommendationId: "recommendation_1",
      title: "Investigate new critical audit issue: Broken internal link",
      rationale: "The cause remains unknown.",
      steps: ["Review both saved audits."],
      displayUrls: ["https://example.com/pricing"],
      status: "proposed",
      reviewVersion: 0,
      dismissalReason: null,
      snoozedUntil: null,
      actionId: null,
      dueOn: null,
      templateVersion: "new-critical-audit-issue-investigation-v1",
      evidenceSummary: {
        kind: "new_critical_audit_issue",
        issueType: "broken-internal-link",
        title: "Broken internal link",
        page: "https://example.com/pricing",
        targetUrl: "https://example.com/missing",
        baselineAuditAt: "2026-08-01T00:00:00.000Z",
        currentAuditAt: "2026-09-01T00:00:00.000Z",
      },
    } satisfies GrowthInvestigationView);
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(GrowthInvestigationReview, {
          projectId: "project_1",
          signalId: "signal_1",
        }),
      ),
    );
    expect(html).toContain('aria-label="Saved critical audit issue evidence"');
    expect(html).toContain("Saved audit comparison");
    expect(html).toContain("Broken internal link");
    expect(html).toContain("https://example.com/missing");
    expect(html).toContain("1 Aug 2026");
    expect(html).toContain("1 Sept 2026");
    expect(html).toContain(
      "same saved audit issue, affected page and broken target",
    );
    expect(html).not.toContain("same saved query and page");
  });
});
