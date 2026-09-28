import { z } from "zod";
import { GROWTH_MEASUREMENT_OUTCOMES } from "@/types/schemas/growth-measurements";
import type {
  GrowthWorkMeasurementConfounderCandidate,
  GrowthWorkMeasurementPlan,
} from "@/types/schemas/growth-work";

export type MeasurementOutcome = NonNullable<
  GrowthWorkMeasurementPlan["result"]
>["outcome"];

export type GrowthWorkMeasurementFinalizationDraft = {
  outcome: MeasurementOutcome;
  confidence: number;
  summary: string;
  confoundingChangeEventIds: string[];
};

export type GrowthWorkMeasurementFinalizationValues = {
  outcome: string;
  confidencePercent: string;
  summary: string;
  confoundingChangeEventIds: string[];
};

export function createGrowthWorkMeasurementFinalizationFormSchema({
  reviewState,
  candidates,
}: {
  reviewState: "ready" | "not_measurable_only";
  candidates: GrowthWorkMeasurementConfounderCandidate[];
}) {
  const candidateIds = new Set(candidates.map(({ id }) => id));
  return z
    .strictObject({
      outcome: z
        .string()
        .refine(
          (value): value is MeasurementOutcome =>
            GROWTH_MEASUREMENT_OUTCOMES.some((outcome) => outcome === value),
          "Choose an outcome",
        ),
      confidencePercent: z
        .string()
        .regex(/^\d+$/, "Enter a whole percentage from 0 to 100")
        .refine(
          (value) => Number(value) >= 0 && Number(value) <= 100,
          "Enter a whole percentage from 0 to 100",
        ),
      summary: z
        .string()
        .trim()
        .min(1, "Summarise your interpretation")
        .max(5000, "Use 5,000 characters or fewer"),
      confoundingChangeEventIds: z
        .array(z.string())
        .refine(
          (ids) => ids.every((candidateId) => candidateIds.has(candidateId)),
          "Choose only the possible changes shown",
        ),
    })
    .superRefine((value, context) => {
      if (
        reviewState === "not_measurable_only" &&
        value.outcome !== "not_measurable"
      )
        context.addIssue({
          code: "custom",
          path: ["outcome"],
          message: "Choose Not measurable while required evidence is missing",
        });
    });
}

export function parseGrowthWorkMeasurementFinalizationDraft({
  values,
  reviewState,
  candidates,
}: {
  values: GrowthWorkMeasurementFinalizationValues;
  reviewState: "ready" | "not_measurable_only";
  candidates: GrowthWorkMeasurementConfounderCandidate[];
}): GrowthWorkMeasurementFinalizationDraft {
  const parsed = createGrowthWorkMeasurementFinalizationFormSchema({
    reviewState,
    candidates,
  }).parse(values);
  return {
    outcome: parsed.outcome,
    confidence: Number(parsed.confidencePercent) / 100,
    summary: parsed.summary,
    confoundingChangeEventIds: [
      ...new Set(parsed.confoundingChangeEventIds),
    ].toSorted(),
  };
}
