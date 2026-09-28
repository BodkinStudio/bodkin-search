import { describe, expect, it } from "vitest";
import { decisionProseNeedsRefresh } from "./growth-investigation-quality";

const validDecision = {
  decisionVerdict: "investigate",
  decisionHeadline: "Clarify which page should meet this search need",
  decisionWhyThisPage:
    "The selected observation points to this page, but the commercial role is not yet clear.",
  decisionRationale:
    "The available evidence supports resolving the page role before proposing an edit.",
  decisionNextAction:
    "Compare the page purpose with the relevant commercial page and record the intended destination.",
  decisionExpectedOutcome:
    "A documented page role that determines whether a content change is justified.",
  decisionMeasurement:
    "Record the selected destination and the evidence used for that choice.",
  decisionCaveat: "The supplied evidence does not establish conversion impact.",
};

describe("decisionProseNeedsRefresh", () => {
  it("allows a qualitative decision whose evidence carries the metrics", () => {
    expect(decisionProseNeedsRefresh(validDecision)).toBe(false);
  });

  it("allows ordinary sequencing and a singular action", () => {
    expect(
      decisionProseNeedsRefresh({
        ...validDecision,
        decisionNextAction:
          "First, compare the selected page with one commercial destination.",
      }),
    ).toBe(false);
  });
  it("rejects written quantities attached to query metrics", () => {
    expect(
      decisionProseNeedsRefresh({
        ...validDecision,
        decisionRationale: "The selected query received a dozen impressions.",
      }),
    ).toBe(true);
  });
  it("rejects generic outcomes that name no practical purpose", () => {
    for (const decisionExpectedOutcome of [
      "Better results.",
      "A positive outcome.",
      "Better results for users.",
      "This creates a positive outcome.",
      "Cannot be estimated from supplied evidence.",
    ])
      expect(
        decisionProseNeedsRefresh({
          ...validDecision,
          decisionExpectedOutcome,
        }),
      ).toBe(true);
  });
  it("rejects numeric claims, including the previously swapped query metric", () => {
    expect(
      decisionProseNeedsRefresh({
        ...validDecision,
        decisionRationale:
          "The Microsoft Teams SMS query has 17 impressions, so the page should change.",
      }),
    ).toBe(true);
  });

  it("rejects evidence identifiers and written quantities", () => {
    expect(
      decisionProseNeedsRefresh({
        ...validDecision,
        decisionWhyThisPage:
          "Evidence 123e4567-e89b-12d3-a456-426614174000 supports one concrete action.",
      }),
    ).toBe(true);
  });

  it("rejects quantitative generalisations", () => {
    expect(
      decisionProseNeedsRefresh({
        ...validDecision,
        decisionRationale:
          "Most queries have high-impression visibility and low-CTR performance.",
      }),
    ).toBe(true);
  });

  it("rejects a vague expected outcome or incomplete decision", () => {
    expect(
      decisionProseNeedsRefresh({
        ...validDecision,
        decisionExpectedOutcome: "Not enough information.",
      }),
    ).toBe(true);
    expect(
      decisionProseNeedsRefresh({
        ...validDecision,
        decisionMeasurement: " ",
      }),
    ).toBe(true);
  });

  it("rejects an investigate measurement that assumes a page change", () => {
    expect(
      decisionProseNeedsRefresh({
        ...validDecision,
        decisionMeasurement: "Review the result after implementation.",
      }),
    ).toBe(true);
  });
});
