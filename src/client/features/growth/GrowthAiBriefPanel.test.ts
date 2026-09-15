import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { GrowthAiBriefPanel } from "./GrowthAiBriefPanel";
import type { SavedGrowthAiBrief } from "@/types/schemas/growth-investigations";

const server = vi.hoisted(() => ({
  generateGrowthAiInvestigationBrief: vi.fn(),
  getSavedGrowthAiBrief: vi.fn(),
  saveGrowthAiInvestigationBrief: vi.fn(),
  approveGrowthAiInvestigationBrief: vi.fn(),
}));
vi.mock("@/serverFunctions/growthInvestigations", () => server);

const saved: SavedGrowthAiBrief = {
  id: "brief_1",
  projectId: "project_1",
  signalId: "signal_1",
  recommendationId: "recommendation_1",
  templateVersion: "priority-page-investigation-v1",
  model: "fixture/model",
  promptVersion: "growth-brief-v2",
  generated: {
    kind: "growth_ai_brief",
    generatedAt: "2026-09-06T20:00:00.000Z",
    affectedPageUrl: "https://example.com/page",
    currentBusinessContext: "available",
    currentPageRead: { status: "unavailable" },
    businessRelevance: "Relevant to the business.",
    observations: [{ statement: "Observed decline", citationIds: ["saved"] }],
    hypotheses: [
      {
        statement: "Possible intent mismatch",
        confidence: "low",
        citationIds: ["saved"],
      },
    ],
    proposedSteps: ["Original AI step"],
    measurementApproach: "Original measurement suggestion",
    caveats: ["Cause remains unknown."],
    citations: [
      {
        id: "saved",
        label: "Saved search observations",
        snapshot: "Saved search metrics supplied to the model",
        source: "historical_saved_evidence",
      },
    ],
  },
  proposal: {
    version: 2,
    title: "Edited proposal title",
    proposedSteps: ["User-reviewed work step"],
    measurementApproach: "User-reviewed measurement approach",
  },
  approval: null,
};
function render(brief: SavedGrowthAiBrief | null, props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["growthAiBrief", "project_1", "signal_1"], brief);
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(GrowthAiBriefPanel, {
        projectId: "project_1",
        signalId: "signal_1",
        canApprove: true,
        ...props,
      }),
    ),
  );
}

describe("Saved AI brief rendered contract", () => {
  it("opens without generation and explains provider use before explicit generation", () => {
    const html = render(null);
    expect(html).toContain("Generate AI draft");
    expect(html).toContain("generation uses its credits");
    expect(server.generateGrowthAiInvestigationBrief).not.toHaveBeenCalled();
  });
  it("keeps known URL separate from unreadable content and original evidence separate from edits", () => {
    const html = render(saved);
    expect(html).toContain("Affected page: https://example.com/page");
    expect(html).toContain("page content could not be inspected");
    expect(html).toContain("Original AI step");
    expect(html).toContain("User-reviewed work step");
    expect(html).toContain("Saved search observations");
    expect(html).toContain("Approve saved proposal (version 2)");
    expect(html).toContain('aria-label="Edit AI proposal"');
    expect(html).toContain('aria-label="Approve saved AI proposal"');
    expect(html).toContain(
      "Record the website change before setting up a formal measurement",
    );
    expect(html).not.toContain("Regenerate");
  });
  it("renders approved version and direct Work link without editable controls", () => {
    const html = render({
      ...saved,
      approval: {
        actionId: "action_1",
        version: 2,
        dueOn: "2026-09-15",
        approvedAt: "2026-09-06T21:00:00.000Z",
        actorId: "user_1",
      },
    });
    expect(html).toContain("Version 2 approved");
    expect(html).toContain('href="#growth-action-action_1"');
    expect(html).toContain("User-reviewed work step");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Approve saved proposal");
  });
  it("does not offer generation or approval in read-only Work views", () => {
    expect(render(null, { readOnly: true })).not.toContain("Generate AI draft");
    expect(render(saved, { readOnly: true })).not.toContain("<form");
  });
});
