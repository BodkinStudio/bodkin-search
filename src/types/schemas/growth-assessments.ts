import { z } from "zod";
const text = z.string().trim().max(4000);
const option = z.strictObject({
  id: z.string().uuid().optional(),
  kind: z.enum(["page", "measurement", "research", "defer"]),
  title: text,
  businessRelevance: text,
  evidenceSource: text,
  evidenceDate: text,
  evidenceScope: text,
  observation: text,
  uncertainty: text,
  nextValidation: text,
  disposition: z.enum(["selected", "alternative", "deferred"]),
  keyPageId: z.string().uuid().nullable(),
});
export const saveGrowthAssessmentSchema = z
  .strictObject({
    projectId: z.string().uuid(),
    expectedVersion: z.number().int().nonnegative().nullable(),
    status: z.enum(["draft", "ready"]),
    objective: text,
    market: text,
    audience: text,
    successMeasure: text,
    objectiveConfirmed: z.boolean(),
    comparisonRationale: text,
    options: z.array(option).max(6),
  })
  .superRefine((value, context) => {
    if (value.status !== "ready") return;
    if (!value.objectiveConfirmed || !value.objective)
      context.addIssue({
        code: "custom",
        path: ["objective"],
        message: "Confirm the business objective before marking this ready",
      });
    if (value.options.length < 2)
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Compare at least two options",
      });
    const selected = value.options.filter(
      (item) => item.disposition === "selected",
    );
    if (selected.length !== 1)
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Choose exactly one option",
      });
    for (const [key, label] of [
      ["market", "Market"],
      ["audience", "Audience"],
      ["comparisonRationale", "Why this option takes priority"],
      ["successMeasure", "Success measure"],
    ] as const) {
      if (!value[key])
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${label} is required for a ready assessment`,
        });
    }
    for (const [index, candidate] of value.options.entries()) {
      for (const [key, label] of [
        ["title", "Option name"],
        ["businessRelevance", "Business relevance"],
        ["evidenceSource", "Evidence source"],
        ["evidenceDate", "Evidence date"],
        ["evidenceScope", "Evidence scope"],
        ["observation", "Observation"],
        ["uncertainty", "Uncertainty"],
        ["nextValidation", "Next validation"],
      ] as const) {
        if (!candidate[key])
          context.addIssue({
            code: "custom",
            path: ["options", index, key],
            message: `Option ${index + 1}: ${label} is required`,
          });
      }
      if (
        candidate.kind === "page" &&
        candidate.disposition === "selected" &&
        !candidate.keyPageId
      )
        context.addIssue({
          code: "custom",
          path: ["options", index, "keyPageId"],
          message: "Select the project page for the chosen page option",
        });
    }
    if (
      !value.options.some((candidate) => candidate.disposition !== "selected")
    )
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Include a named alternative or deferred option",
      });
  });
export const getGrowthAssessmentSchema = z.strictObject({
  projectId: z.string().uuid(),
});

/** Request a new, explicitly-unconfirmed priority draft from saved evidence. */
export const generateGrowthAssessmentSchema = z.strictObject({
  projectId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative().nullable(),
  businessContext: z.string().trim().max(2_000).optional(),
});
export type SaveGrowthAssessmentInput = z.output<
  typeof saveGrowthAssessmentSchema
>;
export type GenerateGrowthAssessmentInput = z.output<
  typeof generateGrowthAssessmentSchema
>;

export const confirmGrowthAssessmentSchema = z.strictObject({
  projectId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
});
