import { z } from "zod";
import { growthMonthlyReportDtoSchema } from "./growth-monthly-reports";
import { growthDueMeasurementsDtoSchema } from "./growth-project-summary";

const GROWTH_MONTHLY_REVIEW_WARNING_CODES = [
  "PRIORITY_PAGE_CHECK_PARTIAL",
  "PRIORITY_PAGE_CHECK_FAILED",
  "PRIORITY_PAGE_CHECK_RUNNING",
  "DUE_MEASUREMENTS_OVERFLOW",
  "DUE_MEASUREMENTS_FAILED",
  "MONTHLY_REPORT_DRIFT",
  "MONTHLY_REPORT_FAILED",
] as const;

const id = z.string().trim().min(1).max(100);
const requestKey = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);
const calendarDate = z.string().date();
const timestamp = z.string().datetime({ offset: true });
export const runGrowthMonthlyReviewRequestSchema = z.strictObject({
  projectId: id,
  requestKey,
});

export const scheduledGrowthMonthlyReviewInputSchema = z
  .strictObject({
    projectId: id,
    cadenceSlot: z.string().trim().min(1).max(200),
    periodStart: calendarDate,
    periodEnd: calendarDate,
    reportTimezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value }).format();
          return true;
        } catch {
          return false;
        }
      }, "Use a valid IANA timezone"),
    scheduledAt: timestamp,
    settingsRevision: z.number().int().min(1),
  })
  .superRefine((value, context) => {
    if (value.periodStart > value.periodEnd)
      context.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "Period end must be on or after period start",
      });
    const expectedSlot = `monthly-review:scheduled:${value.periodStart}:${value.periodEnd}`;
    if (value.cadenceSlot !== expectedSlot)
      context.addIssue({
        code: "custom",
        path: ["cadenceSlot"],
        message: "Scheduled cadence slot must match its period",
      });
  });

const runCoordinateShape = {
  id,
  periodStart: calendarDate,
  periodEnd: calendarDate,
  startedAt: timestamp,
} as const;

const runningRunSummarySchema = z.strictObject({
  ...runCoordinateShape,
  status: z.literal("running"),
  completedAt: z.null(),
  failureCode: z.null(),
  failureMessage: z.null(),
});

const completedRunSummarySchema = z.strictObject({
  ...runCoordinateShape,
  status: z.literal("completed"),
  completedAt: timestamp,
  failureCode: z.null(),
  failureMessage: z.null(),
});

const partiallyCompletedCoordinatorRunSummarySchema = z.strictObject({
  ...runCoordinateShape,
  status: z.literal("completed_with_errors"),
  completedAt: timestamp,
  failureCode: z.literal("MONTHLY_REVIEW_PARTIAL"),
  failureMessage: z.literal(
    "Monthly review completed with one or more incomplete phases.",
  ),
});

const failedCoordinatorRunSummarySchema = z.strictObject({
  ...runCoordinateShape,
  status: z.literal("failed"),
  completedAt: timestamp,
  failureCode: z.literal("MONTHLY_REVIEW_FAILED"),
  failureMessage: z.literal("Monthly review could not complete any phase."),
});

const terminalCoordinatorRunSummarySchema = z.discriminatedUnion("status", [
  completedRunSummarySchema,
  partiallyCompletedCoordinatorRunSummarySchema,
  failedCoordinatorRunSummarySchema,
]);

const coordinatorRunSummarySchema = z.discriminatedUnion("status", [
  runningRunSummarySchema,
  completedRunSummarySchema,
  partiallyCompletedCoordinatorRunSummarySchema,
  failedCoordinatorRunSummarySchema,
]);

const runningCheckRunSummarySchema = z.strictObject({
  ...runCoordinateShape,
  status: z.literal("running"),
  completedAt: z.null(),
});

const checkRunSummarySchema = z.discriminatedUnion("status", [
  runningCheckRunSummarySchema,
  z.strictObject({
    ...runCoordinateShape,
    status: z.literal("completed"),
    completedAt: timestamp,
  }),
  z.strictObject({
    ...runCoordinateShape,
    status: z.literal("completed_with_errors"),
    completedAt: timestamp,
  }),
  z.strictObject({
    ...runCoordinateShape,
    status: z.literal("failed"),
    completedAt: timestamp,
  }),
]);

const checkPhaseSchema = z.strictObject({
  replayed: z.boolean(),
  run: checkRunSummarySchema,
});

const warningCodeSchema = z.enum(GROWTH_MONTHLY_REVIEW_WARNING_CODES);
const warningOrder = new Map(
  GROWTH_MONTHLY_REVIEW_WARNING_CODES.map((code, position) => [code, position]),
);
const orderedWarningsSchema = z
  .array(warningCodeSchema)
  .max(GROWTH_MONTHLY_REVIEW_WARNING_CODES.length)
  .superRefine((warnings, context) => {
    let previousPosition = -1;
    for (const [index, warning] of warnings.entries()) {
      const position = warningOrder.get(warning) ?? -1;
      if (position <= previousPosition)
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Warning codes must be unique and in phase order",
        });
      previousPosition = position;
    }
  });

/** Strict, bounded result of one explicit monthly review attempt. */
export const growthMonthlyReviewResponseSchema = z.discriminatedUnion(
  "replayed",
  [
    z.strictObject({
      replayed: z.literal(true),
      run: coordinatorRunSummarySchema,
    }),
    z.strictObject({
      replayed: z.literal(false),
      consistency: z.literal("current_not_snapshot"),
      run: terminalCoordinatorRunSummarySchema,
      check: checkPhaseSchema.nullable(),
      dueMeasurements: growthDueMeasurementsDtoSchema.nullable(),
      report: growthMonthlyReportDtoSchema.nullable(),
      warnings: orderedWarningsSchema,
    }),
  ],
);

export type RunGrowthMonthlyReviewRequest = z.output<
  typeof runGrowthMonthlyReviewRequestSchema
>;
export type GrowthMonthlyReviewResponse = z.output<
  typeof growthMonthlyReviewResponseSchema
>;
export type ScheduledGrowthMonthlyReviewInput = z.output<
  typeof scheduledGrowthMonthlyReviewInputSchema
>;
