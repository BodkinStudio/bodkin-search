import { z } from "zod";
import { GROWTH_ACTION_STATUSES } from "./growth-actions";

// Shared contract for the Growth Plan: Workstreams own plan Actions, each with a
// plain-language rationale and tagged Evidence. Server functions, MCP tools and the
// Plan page all build against these shapes.

export const GROWTH_WORKSTREAM_STATUSES = [
  "active",
  "done",
  "dropped",
] as const;

export const GROWTH_EVIDENCE_KINDS = [
  "measured",
  "sampled",
  "estimate",
  "judgement",
  "reference",
] as const;
export type GrowthEvidenceKind = (typeof GROWTH_EVIDENCE_KINDS)[number];

export const GROWTH_EVIDENCE_KIND_LABELS: Record<GrowthEvidenceKind, string> = {
  measured: "Measured",
  sampled: "Sampled",
  estimate: "Estimate",
  judgement: "Judgement",
  reference: "Reference",
};

export const GROWTH_EVIDENCE_KIND_DESCRIPTIONS: Record<
  GrowthEvidenceKind,
  string
> = {
  measured:
    "Read directly from an account the project owns (Search Console, GA4, YouTube, rank tracking).",
  sampled:
    "Observed once on a named date, such as a live Google result or a page fetch.",
  estimate:
    "A third-party estimate such as provider search volume. Good for comparing sizes, not counting people.",
  judgement: "The author's interpretation or recommendation.",
  reference:
    "Documentation or a public record, such as vendor docs or a case study.",
};

const id = z.string().trim().min(1).max(100);
const requestKey = z
  .string()
  .uuid()
  .describe(
    "Client-generated idempotency UUID. Reuse it only to retry this exact immutable fact.",
  );
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => /^https?:\/\//i.test(value), "Expected an http(s) URL");

const workstreamTargetShape = {
  targetLabel: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .nullable()
    .describe(
      'What success looks like, e.g. "200 Google clicks per 28 days across the 37 Teams URLs".',
    ),
  targetBaseline: z.number().finite().nullable().describe("Starting value."),
  targetValue: z.number().finite().nullable().describe("Value to reach."),
  targetDueOn: dateOnly.nullable().describe("Date the target is judged on."),
} as const;

// ---------- Evidence data series (charts the plan author supplies) ----------

// monthly: one point per calendar month, label YYYY-MM, drawn as a line.
// bars: categories with a value each, drawn as horizontal bars.
// matrix: label = row (e.g. a search query), group = column (e.g. a company),
// value = the cell (e.g. an organic position; null = absent).
export const GROWTH_EVIDENCE_SERIES_KINDS = [
  "monthly",
  "bars",
  "matrix",
] as const;
export type GrowthEvidenceSeriesKind =
  (typeof GROWTH_EVIDENCE_SERIES_KINDS)[number];

const growthEvidenceSeriesPointInputSchema = z.strictObject({
  label: z.string().trim().min(1).max(100),
  group: z.string().trim().min(1).max(100).nullable().optional(),
  value: z.number().finite().nullable(),
});

export const growthEvidenceSeriesInputSchema = z.strictObject({
  kind: z.enum(GROWTH_EVIDENCE_SERIES_KINDS),
  title: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(50),
  // Bounded so one action graph stays within a single database batch.
  points: z.array(growthEvidenceSeriesPointInputSchema).min(1).max(120),
});
export type GrowthEvidenceSeriesInput = z.infer<
  typeof growthEvidenceSeriesInputSchema
>;

export const growthEvidenceSeriesDtoSchema = z.strictObject({
  id,
  kind: z.enum(GROWTH_EVIDENCE_SERIES_KINDS),
  title: z.string(),
  unit: z.string(),
  points: z.array(
    z.strictObject({
      label: z.string(),
      group: z.string().nullable(),
      value: z.number().nullable(),
      position: z.number().int().min(1),
    }),
  ),
});
export type GrowthEvidenceSeriesDto = z.infer<
  typeof growthEvidenceSeriesDtoSchema
>;

// ---------- DTOs ----------

export const growthActionEvidenceDtoSchema = z.strictObject({
  id,
  kind: z.enum(GROWTH_EVIDENCE_KINDS),
  statement: z.string(),
  sourceLabel: z.string(),
  sourceUrl: z.string().nullable(),
  observedOn: z.string().nullable(),
  position: z.number().int().min(1),
  series: growthEvidenceSeriesDtoSchema.nullable(),
});
export type GrowthActionEvidenceDto = z.infer<
  typeof growthActionEvidenceDtoSchema
>;

const growthPlanActionTargetDtoSchema = z.strictObject({
  targetType: z.enum(["url", "keyword", "cluster", "site"]),
  targetValue: z.string(),
});

export const growthPlanActionDtoSchema = z.strictObject({
  id,
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(GROWTH_ACTION_STATUSES),
  stateVersion: z.number().int().min(0),
  rationale: z.string().nullable(),
  successMeasure: z.string().nullable(),
  dueOn: dateOnly,
  // False when the action came from an accepted Recommendation and was later
  // attached to a workstream; true when it was created directly in the plan.
  isPlanAction: z.boolean(),
  workstreamPosition: z.number().int().min(1).nullable(),
  targets: z.array(growthPlanActionTargetDtoSchema),
  evidence: z.array(growthActionEvidenceDtoSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GrowthPlanActionDto = z.infer<typeof growthPlanActionDtoSchema>;

export const growthWorkstreamDtoSchema = z.strictObject({
  id,
  position: z.number().int().min(1),
  title: z.string(),
  commercialReason: z.string(),
  status: z.enum(GROWTH_WORKSTREAM_STATUSES),
  ...workstreamTargetShape,
  actions: z.array(growthPlanActionDtoSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GrowthWorkstreamDto = z.infer<typeof growthWorkstreamDtoSchema>;

export const growthPlanDtoSchema = z.strictObject({
  projectId: id,
  workstreams: z.array(growthWorkstreamDtoSchema),
  // Latest updatedAt across workstreams, actions and evidence; null when empty.
  updatedAt: z.string().nullable(),
  // Plan-level narrative, stored as project-context sections. Optional until the
  // backend populates them.
  thesis: z.string().nullable().optional(),
  lede: z.string().nullable().optional(),
});
export type GrowthPlanDto = z.infer<typeof growthPlanDtoSchema>;

// ---------- Inputs (server functions and MCP tools share these shapes) ----------

export const getGrowthPlanInputSchema = z.strictObject({ projectId: id });

const growthWorkstreamFieldsShape = {
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Short name of the workstream."),
  commercialReason: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe("Why this workstream matters to revenue, in plain language."),
} as const;

export const createGrowthWorkstreamInputSchema = z.strictObject({
  projectId: id,
  requestKey: requestKey.optional(),
  ...growthWorkstreamFieldsShape,
  targetLabel: workstreamTargetShape.targetLabel.optional(),
  targetBaseline: workstreamTargetShape.targetBaseline.optional(),
  targetValue: workstreamTargetShape.targetValue.optional(),
  targetDueOn: workstreamTargetShape.targetDueOn.optional(),
});
export type CreateGrowthWorkstreamInput = z.infer<
  typeof createGrowthWorkstreamInputSchema
>;

export const updateGrowthWorkstreamInputSchema = z.strictObject({
  projectId: id,
  workstreamId: id,
  title: growthWorkstreamFieldsShape.title.optional(),
  commercialReason: growthWorkstreamFieldsShape.commercialReason.optional(),
  status: z.enum(GROWTH_WORKSTREAM_STATUSES).optional(),
  targetLabel: workstreamTargetShape.targetLabel.optional(),
  targetBaseline: workstreamTargetShape.targetBaseline.optional(),
  targetValue: workstreamTargetShape.targetValue.optional(),
  targetDueOn: workstreamTargetShape.targetDueOn.optional(),
});
export type UpdateGrowthWorkstreamInput = z.infer<
  typeof updateGrowthWorkstreamInputSchema
>;

export const reorderGrowthWorkstreamsInputSchema = z.strictObject({
  projectId: id,
  // Must contain every workstream id for the project exactly once.
  orderedWorkstreamIds: z.array(id).min(1).max(100),
});

export const deleteGrowthWorkstreamInputSchema = z.strictObject({
  projectId: id,
  workstreamId: id,
});

export const growthActionEvidenceInputSchema = z.strictObject({
  kind: z
    .enum(GROWTH_EVIDENCE_KINDS)
    .describe(
      "measured = read from the project's own accounts; sampled = observed once on a date; estimate = third-party estimate; judgement = author's interpretation; reference = documentation or public record.",
    ),
  statement: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .describe(
      "The evidence itself, with its numbers and dates, in one or two sentences.",
    ),
  sourceLabel: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe(
      'Where it came from, e.g. "Search Console, 14 Aug - 10 Sep 2026".',
    ),
  sourceUrl: httpUrl.nullable().optional(),
  observedOn: dateOnly.nullable().optional(),
  series: growthEvidenceSeriesInputSchema
    .nullable()
    .optional()
    .describe(
      "Optional data behind the statement, drawn as a chart on the plan. Supply the numbers the statement quotes, with their unit.",
    ),
});
export type GrowthActionEvidenceInput = z.infer<
  typeof growthActionEvidenceInputSchema
>;

const growthPlanActionFieldsShape = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000).nullable().optional(),
  rationale: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe(
      "Why this action is in the plan, written for a reader who knows nothing about SEO.",
    ),
  successMeasure: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .nullable()
    .optional()
    .describe(
      'The number this should move and the window, e.g. "Clicks on the Teams page, 28-day windows".',
    ),
  dueOn: dateOnly.describe("Target completion date, YYYY-MM-DD."),
} as const;

// Targets are what the evidence charts derive from, so URL targets must be
// absolute http(s) URLs; the service canonicalises them on write.
export const growthPlanActionTargetInputSchema = z
  .strictObject({
    targetType: z.enum(["url", "keyword", "cluster", "site"]),
    targetValue: z.string().trim().min(1).max(2000),
  })
  .superRefine((value, context) => {
    if (value.targetType === "url" && !/^https?:\/\//i.test(value.targetValue))
      context.addIssue({
        code: "custom",
        path: ["targetValue"],
        message: "URL targets must start with http:// or https://",
      });
  });
export type GrowthPlanActionTargetInput = z.infer<
  typeof growthPlanActionTargetInputSchema
>;

export const createGrowthPlanActionInputSchema = z.strictObject({
  projectId: id,
  requestKey: requestKey.optional(),
  workstreamId: id,
  ...growthPlanActionFieldsShape,
  category: z.string().trim().min(1).max(100).default("plan"),
  priorityScore: z.number().finite().min(0).default(0),
  targets: z.array(growthPlanActionTargetInputSchema).max(20).default([]),
  evidence: z.array(growthActionEvidenceInputSchema).max(20).default([]),
});
export type CreateGrowthPlanActionInput = z.infer<
  typeof createGrowthPlanActionInputSchema
>;

export const updateGrowthPlanActionInputSchema = z.strictObject({
  projectId: id,
  actionId: id,
  title: growthPlanActionFieldsShape.title.optional(),
  description: growthPlanActionFieldsShape.description,
  rationale: growthPlanActionFieldsShape.rationale.optional(),
  successMeasure: growthPlanActionFieldsShape.successMeasure,
  dueOn: growthPlanActionFieldsShape.dueOn.optional(),
  // Moving to another workstream appends the action at the end of that workstream.
  workstreamId: id.optional(),
});
export type UpdateGrowthPlanActionInput = z.infer<
  typeof updateGrowthPlanActionInputSchema
>;

export const addGrowthActionEvidenceInputSchema = z.strictObject({
  projectId: id,
  requestKey: requestKey.optional(),
  actionId: id,
  evidence: growthActionEvidenceInputSchema,
});

export const removeGrowthActionEvidenceInputSchema = z.strictObject({
  projectId: id,
  actionId: id,
  evidenceId: id,
});

export type ReorderGrowthWorkstreamsInput = z.infer<
  typeof reorderGrowthWorkstreamsInputSchema
>;
export type AddGrowthActionEvidenceInput = z.infer<
  typeof addGrowthActionEvidenceInputSchema
>;
export type RemoveGrowthActionEvidenceInput = z.infer<
  typeof removeGrowthActionEvidenceInputSchema
>;

// ---------- MCP tool requests ----------
//
// External chat clients get the same shapes, except that requestKey is required:
// an MCP client retries on its own and must be able to replay a write safely.

export const growthGetPlanRequestShape = {
  projectId: id.describe("Authorized OpenSEO project ID"),
} as const;

export const growthCreateWorkstreamRequestSchema =
  createGrowthWorkstreamInputSchema.extend({ requestKey });
export type GrowthCreateWorkstreamRequest = z.infer<
  typeof growthCreateWorkstreamRequestSchema
>;

export const growthCreateActionRequestSchema =
  createGrowthPlanActionInputSchema.extend({ requestKey });
export type GrowthCreateActionRequest = z.infer<
  typeof growthCreateActionRequestSchema
>;

export const growthAddActionEvidenceRequestSchema =
  addGrowthActionEvidenceInputSchema.extend({ requestKey });
export type GrowthAddActionEvidenceRequest = z.infer<
  typeof growthAddActionEvidenceRequestSchema
>;

// Status change for an action shown on the Plan page. Goes straight to the
// action state machine, because the investigation work endpoint joins through
// recommendations and plan actions have none.
export const transitionGrowthPlanActionInputSchema = z.strictObject({
  projectId: id,
  actionId: id,
  expectedStatus: z.enum(GROWTH_ACTION_STATUSES),
  expectedVersion: z.number().int().nonnegative(),
  status: z.enum(GROWTH_ACTION_STATUSES),
  note: z.string().trim().min(1).max(2000).nullable().optional(),
});

export * from "./growth-plan-live-evidence";

// Plan-level narrative, stored as project-context custom sections
// "growth-plan-thesis" and "growth-plan-lede". Null clears a field.
export const updateGrowthPlanNarrativeInputSchema = z.strictObject({
  projectId: id,
  thesis: z.string().trim().min(1).max(300).nullable(),
  lede: z.string().trim().min(1).max(1200).nullable(),
});
export type UpdateGrowthPlanNarrativeInput = z.infer<
  typeof updateGrowthPlanNarrativeInputSchema
>;
