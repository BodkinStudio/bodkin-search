import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/serverFunctions/sam", () => ({ createSamSession: vi.fn() }));
vi.mock("@/client/features/sam/samQueries", () => ({
  invalidateSamSessions: vi.fn(),
}));
vi.mock("@/serverFunctions/growthAssessmentInvestigations", () => ({
  getGrowthAssessmentInvestigation: vi.fn(),
  runGrowthAssessmentInvestigation: vi.fn(),
}));
import { GrowthAssessmentExecution } from "./GrowthAssessmentExecution";
import { buildInvestigationResearchDraft } from "./growthInvestigationResearchDraft";
import type { getGrowthAssessmentInvestigation } from "@/serverFunctions/growthAssessmentInvestigations";
type Investigation = NonNullable<
  Awaited<ReturnType<typeof getGrowthAssessmentInvestigation>>
>;
const completed: Investigation = {
  id: "run",
  projectId: "project",
  assessmentId: "assessment",
  assessmentVersion: 8,
  status: "completed",
  startedAt: "2026-09-11T10:00:00Z",
  completedAt: "2026-09-11T10:01:00Z",
  failedAt: null,
  staleAfter: "2026-09-11T10:05:00Z",
  stages: { page: "completed", analytics: "limited", findings: "completed" },
  source: {
    url: "https://example.com/teams",
    observedAt: "2026-09-11T10:00:20Z",
    title: "Teams SMS",
  },
  decision: {
    verdict: "investigate",
    headline: "Check whether Teams searches reach the commercial page",
    whyThisPage:
      "A saved desktop snapshot ranks this article fifteenth for Teams SMS.",
    rationale:
      "That snapshot identifies a candidate, but does not establish that rewriting it will help qualified buyers.",
    nextAction:
      "Compare the article and commercial page for the same Teams SMS queries in Search Console.",
    expectedOutcome:
      "Identify which page serves those searches before assigning page work.",
    measurement:
      "Record each page's clicks and impressions for the same dates and country.",
    caveat: "The ranking snapshot does not prove buyer intent or conversions.",
    evidenceIds: ["ranking"],
  },
  evidence: [
    {
      id: "ranking",
      source: "Saved rank snapshot",
      title: "Teams SMS rank",
      text: "The article ranked 15 on desktop for Teams SMS.",
      url: "https://example.com/teams",
      observedAt: "2026-09-11T10:00:20Z",
      scope: "One desktop snapshot; country unconfirmed.",
    },
  ],
  findings: [
    {
      title: "The article links to a demo",
      whyItMatters: "Readers have a route to enquire.",
      evidence: 'The page contains a link labelled "Book a demo".',
      sourceUrl: "https://example.com/teams",
      observedAt: "2026-09-11T10:00:20Z",
      recommendedNextStep:
        "Verify that a completed demo enquiry records the agreed event.",
      unverified: "A link does not prove a submitted enquiry is recorded.",
    },
  ],
  limitations: ["Google Analytics is not connected."],
  failureMessage: null,
};
function render(data: Investigation | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    ["growthAssessmentInvestigation", "project", "assessment"],
    data,
  );
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(GrowthAssessmentExecution, {
        projectId: "project",
        assessmentId: "assessment",
        autoStart: false,
        onBusyChange: () => {},
      }),
    ),
  );
}
describe("agreed investigation execution", () => {
  it("offers an executable research handoff with scoped evidence and a decision to return", () => {
    expect(render(completed)).toContain("Open research task in SAM");
    expect(render(completed)).toContain("Press Send in SAM to start");
    const draft = buildInvestigationResearchDraft(completed);
    expect(draft).toContain(completed.source.url);
    expect(draft).toContain(completed.decision?.nextAction);
    expect(draft).toContain(completed.evidence[0].text);
    expect(draft).toContain(completed.evidence[0].scope);
    expect(draft).toContain("/p/project/growth/operations");
    expect(draft).toContain(
      "Do not merely repeat this request for more research",
    );
  });
  it("does not launch research for a deprioritised page", () => {
    const data = {
      ...completed,
      decision: { ...completed.decision!, verdict: "deprioritise" as const },
    };
    expect(render(data)).not.toContain("Open research task in SAM");
  });
  it("withdraws an invalid saved draft and offers its replacement", () => {
    const html = render({
      ...completed,
      decision: null,
      decisionNeedsRefresh: true,
    });
    expect(html).toContain("This recommendation needs replacing");
    expect(html).toContain("Replace recommendation");
    expect(html).not.toContain("This page has not been assessed yet");
  });
  it("offers an explicit start for an agreement with no run", () => {
    const html = render(null);
    expect(html).toContain("Start investigation");
    expect(html).toContain("no investigation has run yet");
    expect(html).not.toContain("Investigation finished");
  });
  it("shows persisted progress without implying a finished result", () => {
    const html = render({
      ...completed,
      status: "running",
      staleAfter: "2099-09-11T10:05:00Z",
      completedAt: null,
      findings: [],
    });
    expect(html).toContain("Investigating your agreed direction");
    expect(html).not.toContain("Start investigation");
  });
  it("retains findings with observed evidence, next step and analytics limits", () => {
    const html = render(completed);
    expect(html).toContain(
      "Check whether Teams searches reach the commercial page",
    );
    expect(html).not.toContain("The article links to a demo");
    expect(html).toContain("What to do next");
    expect(html).toContain("candidate");
    expect(html).toContain('href="https://example.com/teams"');
    expect(html).toContain("Evidence behind this decision");
    expect(html).toContain("does not prove buyer intent");
    expect(html).not.toContain("Start investigation");
  });
  it("does not pass off legacy checklist results as an investigation decision", () => {
    const html = render({ ...completed, decision: null, evidence: [] });
    expect(html).toContain("This page has not been assessed yet");
    expect(html).toContain("Investigate whether this page deserves work");
    expect(html).not.toContain("The article links to a demo");
  });
  it("offers retry for a failed or interrupted run", () => {
    expect(
      render({
        ...completed,
        status: "failed",
        failureMessage: "The source page could not be fetched.",
      }),
    ).toContain("Retry investigation");
    const stale = render({
      ...completed,
      status: "running",
      completedAt: null,
    });
    expect(stale).toContain("previous attempt was interrupted");
    expect(stale).toContain("Retry investigation");
  });
});
