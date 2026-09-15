import { z } from "zod";

const id = z.string().uuid();
const stage = z.enum(["pending", "completed", "limited", "failed"]);
const decisionText = (words: number, maxCharacters: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxCharacters)
    .describe(
      `Write one or two plain-language sentences, aiming for no more than ${words} words.`,
    );

export const growthInvestigationDecisionSchema = z.strictObject({
  verdict: z.enum(["change", "investigate", "deprioritise"]),
  headline: decisionText(25, 220),
  whyThisPage: decisionText(60, 600),
  rationale: decisionText(60, 600),
  nextAction: decisionText(60, 600),
  expectedOutcome: decisionText(60, 600).describe(
    "Explain the practical purpose: what will improve or what uncertainty will be resolved. Do not estimate uplift or say it cannot be estimated.",
  ),
  measurement: decisionText(60, 600).describe(
    "For investigate: what evidence will answer the question and permit a decision. For change: how to evaluate the implemented change. For deprioritise: what would justify reconsideration.",
  ),
  caveat: decisionText(60, 600),
  evidenceIds: z.array(z.string().uuid()).min(1).max(12),
});

export const growthAssessmentInvestigationRequestSchema = z.strictObject({
  projectId: id,
  assessmentId: id,
  retryLimited: z.boolean().optional().default(false),
});

export const growthAssessmentInvestigationViewSchema = z.strictObject({
  id,
  projectId: id,
  assessmentId: id,
  assessmentVersion: z.number().int().positive(),
  status: z.enum(["running", "completed", "failed"]),
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  failedAt: z.string().datetime({ offset: true }).nullable(),
  staleAfter: z.string().datetime({ offset: true }),
  stages: z.strictObject({ page: stage, analytics: stage, findings: stage }),
  source: z.strictObject({
    url: z.string().url().nullable(),
    observedAt: z.string().datetime({ offset: true }).nullable(),
    title: z.string().nullable(),
  }),
  findings: z.array(
    z.strictObject({
      title: z.string(),
      whyItMatters: z.string(),
      evidence: z.string(),
      sourceUrl: z.string(),
      observedAt: z.string().datetime({ offset: true }),
      recommendedNextStep: z.string(),
      unverified: z.string(),
    }),
  ),
  evidence: z.array(
    z.strictObject({
      id,
      source: z.string().min(1).max(100),
      title: z.string().min(1).max(300),
      text: z.string().min(1).max(2_000),
      url: z.string().url().nullable(),
      observedAt: z.string().datetime({ offset: true }),
      scope: z.string().min(1).max(300),
    }),
  ),
  decision: growthInvestigationDecisionSchema.nullable(),
  decisionNeedsRefresh: z.boolean().optional(),
  limitations: z.array(z.string()),
  failureMessage: z.string().nullable(),
});
export type GrowthAssessmentInvestigationView = z.output<
  typeof growthAssessmentInvestigationViewSchema
>;
