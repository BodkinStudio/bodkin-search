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

describe("persistent rank-drop investigation evidence", () => {
  it("shows four checks without inventing a rank outside the tracked depth", () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryOnMount: false, staleTime: Infinity },
      },
    });
    client.setQueryData(["growthInvestigation", "project_1", "signal_1"], {
      relationship: "controller",
      recommendationId: "recommendation_1",
      title: "Investigate a persistent tracked-rank drop",
      rationale: "The cause remains unknown.",
      steps: ["Review the four saved rank snapshots."],
      displayUrls: ["https://example.com/pricing"],
      status: "proposed",
      reviewVersion: 0,
      dismissalReason: null,
      snoozedUntil: null,
      actionId: null,
      dueOn: null,
      templateVersion: "persistent-tracked-rank-drop-investigation-v1",
      evidenceSummary: {
        kind: "persistent_tracked_rank_drop",
        keyword: "pricing software",
        device: "mobile",
        page: "https://example.com/pricing",
        site: "example.com",
        serpDepth: 20,
        checks: [
          { checkedAt: "2026-08-01T00:00:00.000Z", position: 4 },
          { checkedAt: "2026-08-08T00:00:00.000Z", position: 8 },
          { checkedAt: "2026-08-15T00:00:00.000Z", position: 9 },
          { checkedAt: "2026-08-22T00:00:00.000Z", position: null },
        ],
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
    expect(html).toContain('aria-label="Saved persistent rank-drop evidence"');
    expect(html).toContain("Saved rank history");
    expect(html).toContain("pricing software");
    expect(html).toContain("mobile");
    expect(html).toContain("Baseline");
    expect(html).toContain("Later check 3");
    expect(html).toContain("Position 4");
    expect(html).toContain("Outside top 20");
    expect(html).not.toContain("Position 21");
  });
});
