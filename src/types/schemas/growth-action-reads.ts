import { z } from "zod";
import { GROWTH_ACTION_STATUSES } from "./growth-actions";

const id = z.string().trim().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });
const statusFilter = z
  .array(z.enum(GROWTH_ACTION_STATUSES))
  .min(1)
  .max(GROWTH_ACTION_STATUSES.length)
  .transform((statuses) =>
    [...new Set(statuses)].toSorted(
      (left, right) =>
        GROWTH_ACTION_STATUSES.indexOf(left) -
        GROWTH_ACTION_STATUSES.indexOf(right),
    ),
  );

/** Bounded, project-scoped cursor for immutable Action creation order. */
const growthActionsReadCursorSchema = z.strictObject({
  createdAt: timestamp.describe(
    "Creation timestamp from the previous nextCursor",
  ),
  id: id.describe("Action ID from the previous nextCursor"),
});

/** The complete query surface for a current, saved Action summary page. */
export const growthActionsReadInputShape = {
  projectId: id.describe("Authorized project ID"),
  statuses: statusFilter
    .optional()
    .describe(
      "Optional Action statuses. Matches any supplied status; duplicates are ignored.",
    ),
  category: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe("Optional exact, trimmed Action category"),
  minPriorityScore: z
    .number()
    .finite()
    .nonnegative()
    .optional()
    .describe("Optional inclusive minimum Action priority score"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Maximum Actions to return; defaults to 20 and cannot exceed 50"),
  cursor: growthActionsReadCursorSchema
    .optional()
    .describe(
      "Continuation cursor copied unchanged from the previous nextCursor",
    ),
} as const;

export const growthActionsReadRequestSchema = z.strictObject(
  growthActionsReadInputShape,
);

const proseTargetDtoSchema = z.strictObject({
  type: z.enum(["keyword", "cluster", "site"]),
  value: z.string().min(1).max(2000),
  redacted: z.boolean(),
  truncated: z.boolean(),
});
const urlTargetDtoSchema = z.strictObject({
  type: z.literal("url"),
  value: z.string().url().max(2048).nullable(),
  queryOrFragmentOmitted: z.boolean(),
  withheld: z.boolean(),
});

const growthActionDisplayTargetDtoSchema = z.discriminatedUnion("type", [
  proseTargetDtoSchema,
  urlTargetDtoSchema,
]);

export const growthActionReadDtoSchema = z.strictObject({
  id,
  title: z.string().min(1).max(300),
  titleRedacted: z.boolean(),
  titleTruncated: z.boolean(),
  category: z.string().min(1).max(100),
  categoryRedacted: z.boolean(),
  categoryTruncated: z.boolean(),
  description: z.string().min(1).max(400),
  descriptionRedacted: z.boolean(),
  descriptionTruncated: z.boolean(),
  priorityScore: z.number().finite().nonnegative(),
  status: z.enum(GROWTH_ACTION_STATUSES),
  version: z.number().int().nonnegative(),
  dueAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  targetCount: z.number().int().min(0).max(100),
  displayTargets: z.array(growthActionDisplayTargetDtoSchema).max(5),
  displayTargetsOmitted: z.boolean(),
  displayTargetsWithheld: z.boolean(),
});

/** Strict, privacy-safe result consumed by the MCP tool and bound SAM agent. */
export const growthActionsReadPageDtoSchema = z.strictObject({
  actions: z.array(growthActionReadDtoSchema).max(50),
  limit: z.number().int().min(1).max(50),
  hasMore: z.boolean(),
  nextCursor: growthActionsReadCursorSchema.nullable(),
});

export type GrowthActionsReadRequest = z.output<
  typeof growthActionsReadRequestSchema
>;
export type GrowthActionReadDto = z.output<typeof growthActionReadDtoSchema>;
export type GrowthActionsReadPageDto = z.output<
  typeof growthActionsReadPageDtoSchema
>;
