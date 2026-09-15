import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type {
  GrowthPlanDto,
  GrowthPlanEvidenceDto,
} from "@/types/schemas/growth-plan";
import { GrowthPlanPage } from "./GrowthPlanPage";

vi.mock("@/serverFunctions/growthPlan", () => ({
  getGrowthPlan: vi.fn(),
  getGrowthPlanEvidence: vi.fn(),
  updateGrowthPlanNarrative: vi.fn(),
  createGrowthWorkstream: vi.fn(),
  updateGrowthWorkstream: vi.fn(),
  reorderGrowthWorkstreams: vi.fn(),
  deleteGrowthWorkstream: vi.fn(),
  createGrowthPlanAction: vi.fn(),
  updateGrowthPlanAction: vi.fn(),
  addGrowthActionEvidence: vi.fn(),
  removeGrowthActionEvidence: vi.fn(),
  transitionGrowthPlanAction: vi.fn(),
}));
vi.mock("@/serverFunctions/growthChangeLog", () => ({
  getGrowthChangeLog: vi.fn(),
}));

const plan: GrowthPlanDto = {
  projectId: "project_1",
  updatedAt: "2026-09-10T09:00:00.000Z",
  thesis: "The Teams page lost two thirds of its search visibility.",
  lede: "Google showed it 15,105 times in August 2025 and 4,854 a year later.",
  workstreams: [
    {
      id: "ws_1",
      position: 1,
      title: "Win the Teams comparison searches",
      commercialReason: "These searches are how buyers shortlist us.",
      status: "active",
      targetLabel: "200 Google clicks per 28 days",
      targetBaseline: 40,
      targetValue: 200,
      targetDueOn: "2026-12-01",
      createdAt: "2026-09-01T09:00:00.000Z",
      updatedAt: "2026-09-10T09:00:00.000Z",
      actions: [
        {
          id: "action_1",
          title: "Rewrite the Teams comparison page",
          description: null,
          status: "in_progress",
          stateVersion: 2,
          rationale: "The page answers a different question to the one asked.",
          successMeasure: "Clicks on the Teams page, 28-day windows",
          dueOn: "2026-10-01",
          isPlanAction: true,
          workstreamPosition: 1,
          targets: [{ targetType: "url", targetValue: "/teams" }],
          evidence: [
            {
              id: "evidence_1",
              kind: "measured",
              statement: "Impressions fell by two thirds in a year.",
              sourceLabel: "Search Console",
              sourceUrl: "https://search.google.com/search-console",
              observedOn: "2026-09-10",
              position: 1,
              series: {
                id: "series_1",
                kind: "monthly",
                title: "Times Google showed the Teams page",
                unit: "impressions",
                points: [
                  {
                    label: "2025-08",
                    group: null,
                    value: 15105,
                    position: 1,
                  },
                  { label: "2026-08", group: null, value: 4854, position: 2 },
                ],
              },
            },
            {
              id: "evidence_2",
              kind: "sampled",
              statement: "Both rivals appear on every core query.",
              sourceLabel: "Live Google results",
              sourceUrl: null,
              observedOn: "2026-09-14",
              position: 2,
              series: {
                id: "series_2",
                kind: "matrix",
                title: "Who ranks for the buyer's queries",
                unit: "position",
                points: [
                  {
                    label: "teams sms",
                    group: "YakChat",
                    value: 12,
                    position: 1,
                  },
                  {
                    label: "teams sms",
                    group: "Falkon",
                    value: 3,
                    position: 2,
                  },
                ],
              },
            },
          ],
          createdAt: "2026-09-01T09:00:00.000Z",
          updatedAt: "2026-09-10T09:00:00.000Z",
        },
      ],
    },
  ],
};

const evidence: GrowthPlanEvidenceDto = {
  plan: {
    scope: "plan",
    workstreamId: null,
    pages: {
      state: "not_connected",
      urls: [],
      totalUrls: 0,
      failedUrls: 0,
      months: [],
      window: null,
    },
    keywords: {
      state: "no_targets",
      items: [],
      totalKeywords: 0,
      rankTracked: false,
    },
  },
  workstreams: [],
};

function render(data: GrowthPlanDto, defaultEdit = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["growthPlan", "project_1"], data);
  client.setQueryData(["growthPlanEvidence", "project_1"], evidence);
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(GrowthPlanPage, { projectId: "project_1", defaultEdit }),
    ),
  );
}

describe("Growth plan page", () => {
  it("reads as a document, with one control", () => {
    const html = render(plan);
    expect(html).toContain("The Teams page lost two thirds");
    expect(html).toContain("Win the Teams comparison searches");
    expect(html).toContain("What we saw");
    expect(html).toContain("Why you should believe this");
    expect(html).not.toContain("<form");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("Edit plan");
  });

  it("puts the controls behind edit mode", () => {
    const html = render(plan, true);
    expect(html).toContain("Add workstream");
    expect(html).toContain("Add action");
    expect(html).toContain("Add evidence");
    expect(html).toContain("Edit thesis and lede");
  });

  it("draws the author's own series", () => {
    const html = render(plan);
    expect(html).toContain("Aug 25 → Aug 26: 15,105 → 4,854 (−68%)");
    expect(html).toContain("YakChat");
    expect(html).toContain("Falkon");
    expect(html).toContain("Show the numbers");
  });

  it("explains how to start a plan when there is none", () => {
    const html = render({ ...plan, workstreams: [], updatedAt: null });
    expect(html).toContain("No plan yet");
    expect(html).toContain("growth_create_workstream");
    expect(html).toContain("growth_create_action");
  });
});
