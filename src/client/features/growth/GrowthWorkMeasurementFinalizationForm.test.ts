import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  GrowthWorkMeasurementConfounderCandidate,
  GrowthWorkMeasurementPlan,
} from "@/types/schemas/growth-work";
import {
  GrowthWorkMeasurementFinalizationForm,
  parseGrowthWorkMeasurementFinalizationDraft,
  type GrowthWorkMeasurementFinalizationValues,
} from "./GrowthWorkMeasurementFinalizationForm";

const candidate: GrowthWorkMeasurementConfounderCandidate = {
  id: "change_1",
  changeType: "content_updated",
  description: "<script>private()</script>",
  happenedAt: "2026-09-01T08:00:00.000Z",
  matchedDisplayUrls: ["https://example.com/pricing"],
};

const readyReview: GrowthWorkMeasurementPlan["review"] & {
  state: "ready";
} = {
  state: "ready",
  availableOn: "2026-10-31",
  primaryEvidenceComplete: true,
  missingPrimaryEvidenceCount: 0,
  revision: "a".repeat(64),
};

const values: GrowthWorkMeasurementFinalizationValues = {
  outcome: "positive",
  confidencePercent: "79",
  summary: "  Clicks rose, but other changes overlapped.  ",
  confoundingChangeEventIds: [candidate.id],
};

function render({
  review = readyReview,
  candidates = [candidate],
  candidateSelectionAvailable = true,
}: {
  review?: GrowthWorkMeasurementPlan["review"] & {
    state: "ready" | "not_measurable_only";
  };
  candidates?: GrowthWorkMeasurementConfounderCandidate[];
  candidateSelectionAvailable?: boolean;
} = {}) {
  return renderToStaticMarkup(
    createElement(GrowthWorkMeasurementFinalizationForm, {
      review,
      candidates,
      candidateSelectionAvailable,
      disabled: false,
      pending: false,
      onSubmit: vi.fn(),
    }),
  );
}

describe("Work measurement finalization form", () => {
  it("starts blank with labelled native controls and no selected confounder", () => {
    const html = render();

    expect(html).toContain('aria-label="Finalize measured result"');
    expect(html).toContain("<label");
    expect(html).toContain("Outcome");
    expect(html).toContain("Confidence in this interpretation (%)");
    expect(html).toContain("Interpretation summary");
    expect(html).toContain('type="number"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="100"');
    expect(html).toContain('step="1"');
    expect(html.match(/required=""/g)?.length).toBe(3);
    expect(html).toContain('value="" selected=""');
    expect(html).not.toContain('checked=""');
    expect(html).toContain("None are selected automatically");
    expect(html).toContain("immutable observational result");
    expect(html).toContain("marks this Work Evaluated");
  });

  it("explains interpretation terms without suggesting a score or causal threshold", () => {
    const html = render();

    expect(html).toContain("Neutral means");
    expect(html).toContain("Inconclusive means");
    expect(html).toContain("Not measurable means");
    expect(html).toContain("human judgements, not automatic thresholds");
    expect(html).toContain("not probability of causation");
    expect(html).toContain("statistical significance");
    expect(html).toContain("data completeness");
    expect(html).not.toContain("recommended confidence");
  });

  it("renders candidate narrative safely", () => {
    const html = render();

    expect(html).toContain("&lt;script&gt;private()&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Content updated");
    expect(html).toContain("1 Sept 2026");
  });

  it("converts an integer percentage and normalizes the exact draft", () => {
    expect(
      parseGrowthWorkMeasurementFinalizationDraft({
        values: {
          ...values,
          confoundingChangeEventIds: ["change_2", candidate.id, candidate.id],
        },
        reviewState: "ready",
        candidates: [candidate, { ...candidate, id: "change_2" }],
      }),
    ).toEqual({
      outcome: "positive",
      confidence: 0.79,
      summary: "Clicks rose, but other changes overlapped.",
      confoundingChangeEventIds: [candidate.id, "change_2"],
    });
  });

  it("accepts the confidence endpoints and rejects blank, fractional, or out-of-range values", () => {
    for (const confidencePercent of ["0", "100"])
      expect(
        parseGrowthWorkMeasurementFinalizationDraft({
          values: { ...values, confidencePercent },
          reviewState: "ready",
          candidates: [candidate],
        }).confidence,
      ).toBe(Number(confidencePercent) / 100);

    for (const confidencePercent of ["", "79.5", "-1", "101"])
      expect(() =>
        parseGrowthWorkMeasurementFinalizationDraft({
          values: { ...values, confidencePercent },
          reviewState: "ready",
          candidates: [candidate],
        }),
      ).toThrow();
  });

  it("validates required fields, summary length, and shown candidate IDs", () => {
    for (const invalid of [
      { ...values, outcome: "" },
      { ...values, summary: "   " },
      { ...values, summary: "x".repeat(5001) },
      { ...values, confoundingChangeEventIds: ["foreign_change"] },
    ])
      expect(() =>
        parseGrowthWorkMeasurementFinalizationDraft({
          values: invalid,
          reviewState: "ready",
          candidates: [candidate],
        }),
      ).toThrow();
  });

  it("offers and accepts only Not measurable when primary evidence is missing", () => {
    const review = {
      ...readyReview,
      state: "not_measurable_only" as const,
      primaryEvidenceComplete: false,
      missingPrimaryEvidenceCount: 2,
    };
    const html = render({ review });

    expect(html).toContain("2 required primary evidence facts are missing");
    expect(html).toContain("only record Not measurable");
    expect(html).not.toContain('value="neutral"');
    expect(() =>
      parseGrowthWorkMeasurementFinalizationDraft({
        values: { ...values, outcome: "neutral" },
        reviewState: review.state,
        candidates: [candidate],
      }),
    ).toThrow();
    expect(
      parseGrowthWorkMeasurementFinalizationDraft({
        values: { ...values, outcome: "not_measurable" },
        reviewState: review.state,
        candidates: [candidate],
      }).outcome,
    ).toBe("not_measurable");
  });

  it("omits candidate controls when discovery is advisory but incomplete", () => {
    const html = render({ candidateSelectionAvailable: false });

    expect(html).not.toContain("Confounding changes to include");
    expect(html).not.toContain('type="checkbox"');
    expect(() =>
      parseGrowthWorkMeasurementFinalizationDraft({
        values,
        reviewState: "ready",
        candidates: [],
      }),
    ).toThrow();
  });
});
