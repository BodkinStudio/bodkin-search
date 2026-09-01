import { z } from "zod";

const GROWTH_UNRESOLVED_RECOMMENDATION_STATUSES = [
  "proposed",
  "snoozed",
  "accepted",
] as const;

const id = z.string().trim().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });
const unresolvedStatus = z.enum(GROWTH_UNRESOLVED_RECOMMENDATION_STATUSES);
const statusFilter = z
  .array(unresolvedStatus)
  .min(1)
  .max(GROWTH_UNRESOLVED_RECOMMENDATION_STATUSES.length)
  .transform((statuses) =>
    [...new Set(statuses)].toSorted(
      (left, right) =>
        GROWTH_UNRESOLVED_RECOMMENDATION_STATUSES.indexOf(left) -
        GROWTH_UNRESOLVED_RECOMMENDATION_STATUSES.indexOf(right),
    ),
  );

const growthPriorityRecommendationsCursorSchema = z.strictObject({
  priorityScore: z.number().finite().nonnegative(),
  createdAt: timestamp,
  id,
});

export const growthPriorityRecommendationsInputShape = {
  projectId: id.describe("Authorized project ID"),
  statuses: statusFilter
    .optional()
    .describe(
      "Optional unresolved Recommendation statuses. Duplicates are ignored.",
    ),
  category: z.string().trim().min(1).max(100).optional(),
  minPriorityScore: z.number().finite().nonnegative().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: growthPriorityRecommendationsCursorSchema.optional(),
} as const;

export const growthPriorityRecommendationsRequestSchema = z
  .strictObject(growthPriorityRecommendationsInputShape)
  .transform((request) =>
    request.cursor
      ? {
          ...request,
          cursor: {
            ...request.cursor,
            createdAt: new Date(request.cursor.createdAt).toISOString(),
          },
        }
      : request,
  );

const proseTarget = z.strictObject({
  type: z.enum(["keyword", "cluster", "site"]),
  value: z.string().min(1).max(2000),
  redacted: z.boolean(),
  truncated: z.boolean(),
});
const urlTarget = z.strictObject({
  type: z.literal("url"),
  value: z.string().url().max(2048).nullable(),
  queryOrFragmentOmitted: z.boolean(),
  withheld: z.boolean(),
});
const target = z.discriminatedUnion("type", [proseTarget, urlTarget]);
const step = z.strictObject({
  content: z.string().min(1).max(2000),
  redacted: z.boolean(),
  truncated: z.boolean(),
});

const growthPriorityRecommendationDtoSchema = z.strictObject({
  id,
  title: z.string().min(1).max(300),
  titleRedacted: z.boolean(),
  titleTruncated: z.boolean(),
  rationale: z.string().min(1).max(400),
  rationaleRedacted: z.boolean(),
  rationaleTruncated: z.boolean(),
  category: z.string().min(1).max(100),
  categoryRedacted: z.boolean(),
  categoryTruncated: z.boolean(),
  impact: z.number().int().min(1).max(5),
  commercialRelevance: z.number().int().min(1).max(5),
  effort: z.number().int().min(1).max(5),
  urgency: z.number().int().min(1).max(3),
  confidence: z.number().min(0).max(1),
  priorityScore: z.number().finite().nonnegative(),
  status: unresolvedStatus,
  reviewVersion: z.number().int().nonnegative(),
  snoozedUntil: timestamp.nullable(),
  reviewedAt: timestamp.nullable(),
  createdAt: timestamp,
  needsAction: z.boolean(),
  targetCount: z.number().int().min(0).max(100),
  displayTargets: z.array(target).max(5),
  displayTargetsOmitted: z.boolean(),
  displayTargetsWithheld: z.boolean(),
  stepCount: z.number().int().min(0).max(100),
  displaySteps: z.array(step).max(5),
  displayStepsOmitted: z.boolean(),
});

export const growthPriorityRecommendationsPageDtoSchema = z.strictObject({
  recommendations: z.array(growthPriorityRecommendationDtoSchema).max(50),
  limit: z.number().int().min(1).max(50),
  hasMore: z.boolean(),
  nextCursor: growthPriorityRecommendationsCursorSchema.nullable(),
});

export type GrowthPriorityRecommendationsRequest = z.output<
  typeof growthPriorityRecommendationsRequestSchema
>;
export type GrowthPriorityRecommendationsPageDto = z.output<
  typeof growthPriorityRecommendationsPageDtoSchema
>;
