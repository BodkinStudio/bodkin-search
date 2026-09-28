import { z } from "zod";

export const GROWTH_OVERVIEW_ACTIVE_ACTION_STATUSES = [
  "approved",
  "ready",
  "in_progress",
  "blocked",
  "implemented",
  "measuring",
] as const;

const count = z.number().int().nonnegative();
const boundedCount = z.strictObject({ count, hasMore: z.boolean() });

export const growthOperatingOverviewRequestSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(100),
});

export const growthOperatingOverviewDtoSchema = z.strictObject({
  asOf: z.string().datetime({ offset: true }),
  consistency: z.literal("current_not_snapshot"),
  opportunities: boundedCount,
  activeWork: boundedCount.extend({
    byStatus: z.strictObject({
      approved: count,
      ready: count,
      in_progress: count,
      blocked: count,
      implemented: count,
      measuring: count,
    }),
  }),
  dueMeasurements: z.strictObject({
    count: count.nullable(),
    hasMore: z.boolean(),
    scanState: z.enum(["complete", "overflow"]),
  }),
  evaluatedMeasurements: z.strictObject({
    count,
    sourceHasMore: z.boolean(),
    inconsistentCount: count,
    byOutcome: z.strictObject({
      strong_positive: count,
      positive: count,
      inconclusive: count,
      neutral: count,
      negative: count,
      strong_negative: count,
      not_measurable: count,
    }),
  }),
  monthlySummary: z.strictObject({
    state: z.enum(["ready", "no_activity", "draft", "published"]),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
  }),
});

export type GrowthOperatingOverviewDto = z.output<
  typeof growthOperatingOverviewDtoSchema
>;
