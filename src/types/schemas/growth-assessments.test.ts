import { describe, expect, it } from "vitest";
import { saveGrowthAssessmentSchema } from "./growth-assessments";

const projectId = "11111111-1111-4111-8111-111111111111";
const option = (disposition: "selected" | "alternative") => ({
  kind: "measurement" as const,
  title: "Measure conversion",
  businessRelevance: "Revenue depends on qualified trials",
  evidenceSource: "Saved report R-1",
  evidenceDate: "2026-09-09",
  evidenceScope: "UK organic traffic",
  observation: "Trial starts fell",
  uncertainty: "Attribution is incomplete",
  nextValidation: "Check next 28 days",
  disposition,
  keyPageId: null,
});
const base = {
  projectId,
  expectedVersion: null,
  status: "ready" as const,
  objective: "Increase qualified trials",
  market: "UK",
  audience: "Operations leaders",
  successMeasure: "Qualified trials",
  objectiveConfirmed: true,
  comparisonRationale: "This option has the clearest validation path",
  options: [option("selected"), option("alternative")],
};

describe("growth assessment validation", () => {
  it("allows incomplete drafts without presenting a recommendation", () =>
    expect(
      saveGrowthAssessmentSchema.safeParse({
        ...base,
        status: "draft",
        objective: "",
        options: [],
      }).success,
    ).toBe(true));
  it("requires meaningful evidence and a named alternative before ready", () => {
    const invalid = saveGrowthAssessmentSchema.safeParse({
      ...base,
      options: [
        { ...option("selected"), evidenceDate: "" },
        { ...option("alternative"), title: "" },
      ],
    });
    expect(invalid.success).toBe(false);
  });
});
