import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  GrowthWorkMeasurementOverview,
  GrowthWorkMeasurementPlan,
} from "@/types/schemas/growth-work";
import { GrowthWorkMeasurementContent } from "./GrowthWorkMeasurementPresentation";
import {
  activeMeasurementPlan,
  measurementOverview,
} from "./GrowthWorkMeasurement.testFixtures";

function overviewWithPlan(
  plan: GrowthWorkMeasurementPlan,
): GrowthWorkMeasurementOverview {
  return {
    ...measurementOverview,
    actionStatus: plan.status === "completed" ? "evaluated" : "measuring",
    stateVersion: plan.status === "completed" ? 4 : 3,
    state: plan.status === "completed" ? "completed" : "active",
    candidates: [],
    proposedMetrics: [],
    plan,
  };
}

function render(
  plan: GrowthWorkMeasurementPlan,
  finalizationControl?: ReactNode,
) {
  return renderToStaticMarkup(
    createElement(GrowthWorkMeasurementContent, {
      data: overviewWithPlan(plan),
      disabled: false,
      pending: false,
      onSubmit: vi.fn(),
      finalizationControl,
    }),
  );
}

function completedPlan(
  result: NonNullable<GrowthWorkMeasurementPlan["result"]>,
): GrowthWorkMeasurementPlan {
  return {
    ...activeMeasurementPlan,
    status: "completed",
    collection: {
      ...activeMeasurementPlan.collection,
      state: "closed",
      canCollect: false,
    },
    confounders: {
      ...activeMeasurementPlan.confounders,
      state: "closed",
      candidates: [],
    },
    review: {
      ...activeMeasurementPlan.review,
      state: "closed",
      revision: null,
    },
    result,
  };
}

describe("Work measurement finalization rendering", () => {
  it("places inline review after the current confounder context", () => {
    const html = render(
      activeMeasurementPlan,
      createElement("section", null, "Inline review marker"),
    );

    expect(html.indexOf("Possible confounding changes")).toBeLessThan(
      html.indexOf("Inline review marker"),
    );
  });

  it("renders safe terminal interpretation and surviving confounder details", () => {
    const html = render(
      completedPlan({
        outcome: "positive",
        confidence: 0.79,
        summary: "<script>summary()</script>",
        evaluatedAt: "2026-11-02T12:00:00.000Z",
        confoundingChanges: [
          {
            id: "change_2",
            changeType: "technical_fix",
            description: "<img src=x onerror=private()>",
            happenedAt: "2026-09-04T10:00:00.000Z",
          },
        ],
      }),
    );

    expect(html).toContain("Measured result");
    expect(html).toContain("saved human interpretation");
    expect(html).toContain("do not establish causation");
    expect(html).toContain("79%");
    expect(html).toContain("Confounding changes included in this result");
    expect(html).toContain("Technical fix");
    expect(html).toContain("&lt;script&gt;summary()&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=private()&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("snapshot");
  });

  it("uses a truthful current-link empty state for a completed result", () => {
    const html = render(
      completedPlan({
        outcome: "not_measurable",
        confidence: 0,
        summary: "Required evidence was unavailable.",
        evaluatedAt: "2026-11-02T12:00:00.000Z",
        confoundingChanges: [],
      }),
    );

    expect(html).toContain(
      "No linked confounding change record is currently available for this result.",
    );
    expect(html).not.toContain("No confounders were selected");
    expect(html).not.toContain("ever");
  });
});
