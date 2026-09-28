import { z } from "zod";
import { GROWTH_ACTION_STATUSES } from "./growth-actions";
import {
  GROWTH_MEASUREMENT_OUTCOMES,
  MAX_GROWTH_MEASUREMENT_METRICS,
} from "./growth-measurements";

const id = z.string().trim().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });
const date = z.string().date();
const statuses = ["active", "completed"] as const;

const statusFilter = z
  .array(z.enum(statuses))
  .min(1)
  .max(statuses.length)
  .transform((value) =>
    [...new Set(value)].toSorted(
      (left, right) => statuses.indexOf(left) - statuses.indexOf(right),
    ),
  );

const growthMeasurementsCursorSchema = z.strictObject({
  createdAt: timestamp,
  id,
});

export const growthMeasurementsInputShape = {
  projectId: id.describe("Authorized project ID"),
  statuses: statusFilter.optional().describe("Optional Plan statuses."),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: growthMeasurementsCursorSchema.optional(),
} as const;

export const growthMeasurementsRequestSchema = z
  .strictObject(growthMeasurementsInputShape)
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

const result = z.strictObject({
  outcome: z.enum(GROWTH_MEASUREMENT_OUTCOMES),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(1000),
  summaryRedacted: z.boolean(),
  summaryTruncated: z.boolean(),
  evaluatedAt: timestamp,
});

const measurement = z.strictObject({
  id,
  actionId: id,
  actionTitle: z.string().min(1).max(300),
  actionTitleRedacted: z.boolean(),
  actionTitleTruncated: z.boolean(),
  actionStatus: z.enum(GROWTH_ACTION_STATUSES),
  actionLifecycle: z.enum(["aligned", "inconsistent"]),
  status: z.enum(statuses),
  actionVersion: z.number().int().positive(),
  anchorAt: timestamp,
  anchorDate: date,
  reportTimezone: z.string().min(1).max(100),
  comparisonMode: z.enum(["preceding_period", "year_over_year", "custom"]),
  baselineStart: date,
  baselineEnd: date,
  cooldownEnd: date,
  measurementStart: date,
  measurementEnd: date,
  longMeasurementEnd: date.nullable(),
  dueDate: date,
  createdAt: timestamp,
  completedAt: timestamp.nullable(),
  metricCount: z.number().int().min(1).max(MAX_GROWTH_MEASUREMENT_METRICS),
  primaryMetricCount: z
    .number()
    .int()
    .min(1)
    .max(MAX_GROWTH_MEASUREMENT_METRICS),
  result: result.nullable(),
});

export const growthMeasurementsPageDtoSchema = z.strictObject({
  measurements: z.array(measurement).max(50),
  limit: z.number().int().min(1).max(50),
  hasMore: z.boolean(),
  nextCursor: growthMeasurementsCursorSchema.nullable(),
});

export type GrowthMeasurementsRequest = z.output<
  typeof growthMeasurementsRequestSchema
>;
export type GrowthMeasurementsPageDto = z.output<
  typeof growthMeasurementsPageDtoSchema
>;
