import { describe, expect, it } from "vitest";
import { invalidGrowthAssessmentCompletionTargetReason } from "./growth-assessment-quality";

describe("invalidGrowthAssessmentCompletionTargetReason", () => {
  it("rejects outcome targets and generic completion placeholders for investigations", () => {
    expect(
      invalidGrowthAssessmentCompletionTargetReason(
        "measurement",
        "Reach rank <=3 for two terms",
      ),
    ).toMatch(/ranking or business outcome/);
    expect(
      invalidGrowthAssessmentCompletionTargetReason(
        "measurement",
        "Achieve a top-3 ranking for Teams SMS",
      ),
    ).toMatch(/ranking or business outcome/);
    expect(
      invalidGrowthAssessmentCompletionTargetReason(
        "research",
        "Task complete when the bounded check is recorded for the cited evidence subject.",
      ),
    ).toMatch(/placeholder/);
  });

  it("allows a concrete investigation result and page target", () => {
    expect(
      invalidGrowthAssessmentCompletionTargetReason(
        "research",
        "Record whether the cited query has a matching landing page.",
      ),
    ).toBeNull();
    expect(
      invalidGrowthAssessmentCompletionTargetReason(
        "measurement",
        "Record average position over the baseline window.",
      ),
    ).toBeNull();
    expect(
      invalidGrowthAssessmentCompletionTargetReason(
        "page",
        "Reach rank <=3 for two terms",
      ),
    ).toBeNull();
  });
});
