import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GrowthOpportunitiesPageDto } from "@/types/schemas/growth-opportunities";

const query = vi.hoisted(() => {
  const refetch = vi.fn();
  return {
    refetch,
    state: {
      isPending: false,
      isError: false,
      isFetching: false,
      refetch,
    },
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => query.state,
}));
vi.mock("@/serverFunctions/growthOpportunities", () => ({
  getGrowthOpportunities: vi.fn(),
}));
vi.mock("./GrowthInvestigation", () => ({
  GrowthInvestigation: ({ signalId }: { signalId: string }) =>
    createElement("p", null, `Lazy Review investigation ${signalId}`),
}));

import {
  GrowthOpportunities,
  GrowthOpportunitiesList,
  GrowthOpportunitiesState,
} from "./GrowthOpportunities";

const recommendation: GrowthOpportunitiesPageDto["recommendations"][number]["recommendation"] =
  {
    id: "recommendation_1",
    title: "Saved title",
    titleRedacted: true,
    titleTruncated: true,
    rationale: "Saved rationale",
    rationaleRedacted: true,
    rationaleTruncated: true,
    category: "content",
    categoryRedacted: true,
    categoryTruncated: true,
    impact: 4,
    commercialRelevance: 5,
    effort: 2,
    urgency: 2,
    confidence: 0.8,
    priorityScore: 42,
    status: "proposed",
    reviewVersion: 0,
    snoozedUntil: null,
    reviewedAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    needsAction: false,
    targetCount: 3,
    displayTargets: [
      {
        type: "keyword",
        value: "pricing terms",
        redacted: true,
        truncated: true,
      },
      {
        type: "url",
        value: "https://example.com/pricing",
        queryOrFragmentOmitted: true,
        withheld: false,
      },
      {
        type: "url",
        value: null,
        queryOrFragmentOmitted: false,
        withheld: true,
      },
    ],
    displayTargetsOmitted: true,
    displayTargetsWithheld: true,
    stepCount: 1,
    displaySteps: [
      { content: "Review evidence", redacted: true, truncated: true },
    ],
    displayStepsOmitted: true,
  };

function page(
  recommendations: GrowthOpportunitiesPageDto["recommendations"],
  hasMore = false,
): GrowthOpportunitiesPageDto {
  return { recommendations, limit: 20, hasMore, nextCursor: null };
}

function findButton(
  node: ReactNode,
  label: string,
): { props: { onClick?: () => void } } | null {
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node))
    return null;
  if (node.type === "button" && node.props.children === label) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findButton(child, label);
    if (found) return found;
  }
  return null;
}

beforeEach(() => {
  query.refetch.mockReset();
  query.state = {
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: query.refetch,
  };
});

describe("Growth opportunities rendered contract", () => {
  it("labels the section and exposes its loading/fetching state", () => {
    query.state = {
      ...query.state,
      isPending: true,
      isFetching: true,
    };
    const html = renderToStaticMarkup(
      createElement(GrowthOpportunities, { projectId: "project_1" }),
    );
    expect(html).toContain('id="growth-opportunities"');
    expect(html).toContain('aria-labelledby="growth-opportunities-title"');
    expect(html).toContain("Loading saved opportunities");
    expect(html).toContain("Refreshing…");
    expect(html).toContain("disabled");
  });

  it("dispatches explicit refresh and error retry controls", () => {
    query.state = { ...query.state, isError: true };
    const tree = GrowthOpportunities({ projectId: "project_1" });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Saved opportunities could not be loaded");
    findButton(tree, "Refresh saved opportunities")?.props.onClick?.();
    const error = GrowthOpportunitiesState({
      state: "error",
      onRetry: query.refetch,
    });
    findButton(error, "Retry saved opportunities")?.props.onClick?.();
    expect(query.refetch).toHaveBeenCalledTimes(2);
  });

  it("points an empty inbox to the available Growth checks", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthOpportunitiesList, {
        projectId: "project_1",
        data: page([]),
      }),
    );
    expect(html).toContain("No unresolved saved opportunities");
    expect(html).toContain("Run a Growth check below");
    expect(html).toContain('href="#growth-live-check-title"');
  });

  it("does not present template defaults as an assessment", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthOpportunitiesList, {
        projectId: "project_1",
        data: page([
          {
            recommendation: {
              ...recommendation,
              impact: 1,
              commercialRelevance: 1,
              effort: 1,
              urgency: 1,
              confidence: 0,
              priorityScore: 0,
            },
            reviewSource: { signalId: "signal_proposed" },
          },
        ]),
      }),
    );
    expect(html).not.toContain("Priority 0");
    expect(html).not.toContain("Confidence 0%");
    expect(html).not.toContain("1/5");
    expect(html).toContain("Ready for review");
    expect(html).toContain("Saved rationale");
    expect(html).toContain("Lazy Review investigation signal_proposed");
  });

  it("renders safe detail disclosures and only delegates proposed/snoozed sources", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthOpportunitiesList, {
        projectId: "project_1",
        data: page(
          [
            {
              recommendation,
              reviewSource: { signalId: "signal_proposed" },
            },
            {
              recommendation: {
                ...recommendation,
                id: "snoozed",
                status: "snoozed",
                snoozedUntil: "2026-09-30T00:00:00.000Z",
              },
              reviewSource: { signalId: "signal_snoozed" },
            },
            {
              recommendation: {
                ...recommendation,
                id: "accepted",
                status: "accepted",
                needsAction: true,
              },
              reviewSource: { signalId: "signal_accepted" },
            },
            {
              recommendation: { ...recommendation, id: "no_source" },
              reviewSource: null,
            },
          ],
          true,
        ),
      }),
    );
    expect(html).toContain("<details");
    expect(html).toContain("Lazy Review investigation signal_proposed");
    expect(html).toContain("Lazy Review investigation signal_snoozed");
    expect(html).not.toContain("Lazy Review investigation signal_accepted");
    expect(html).toContain("older approval has no saved Action");
    expect(html).toContain("Review controls are unavailable");
    expect(html).toContain("Title redacted. Title truncated.");
    expect(html).toContain("Rationale redacted. Rationale truncated.");
    expect(html).toContain("Category redacted. Category truncated.");
    expect(html).toContain("pricing terms (redacted) (truncated)");
    expect(html).toContain("query or fragment omitted");
    expect(html).toContain("Saved page URL withheld");
    expect(html).toContain("Review evidence (redacted) (truncated)");
    expect(html).toContain("Some saved targets are omitted or withheld");
    expect(html).toContain("Additional saved steps are not shown here.");
    expect(html).not.toContain("Confidence 80%");
    expect(html).not.toContain("Priority 42");
    expect(html).not.toContain("Impact 4/5");
    expect(html).toContain("Review business fit, expected benefit and effort");
    expect(html).toContain("More saved opportunities are available");
  });
});
