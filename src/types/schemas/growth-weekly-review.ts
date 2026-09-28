import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });
const calendarDate = z.string().date();
const count = z.number().int().nonnegative();

export const scheduledGrowthWeeklyReviewInputSchema = z
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
    const expectedSlot = `weekly-review:scheduled:${value.periodStart}:${value.periodEnd}`;
    if (value.cadenceSlot !== expectedSlot)
      context.addIssue({
        code: "custom",
        path: ["cadenceSlot"],
        message: "Scheduled cadence slot must match its period",
      });
  });

const runSummary = z.strictObject({
  id,
  status: z.enum(["running", "completed", "completed_with_errors", "failed"]),
  periodStart: calendarDate,
  periodEnd: calendarDate,
  startedAt: timestamp,
  completedAt: timestamp.nullable(),
  failureCode: z.string().min(1).max(100).nullable(),
  failureMessage: z.string().min(1).max(1000).nullable(),
});

const recommendedFocus = z.enum([
  "measurement_scan_required",
  "measurement_review",
  "action_recovery",
  "loss_investigation",
  "striking_distance",
  "reinforce_gains",
  "no_urgent_work",
]);

export const growthWeeklyReviewResponseSchema = z.discriminatedUnion(
  "replayed",
  [
    z.strictObject({ replayed: z.literal(true), run: runSummary }),
    z.strictObject({
      replayed: z.literal(false),
      consistency: z.literal("current_not_snapshot"),
      run: runSummary,
      sections: z.strictObject({
        materialGains: count,
        materialLosses: count,
        newStrikingDistanceOpportunities: count,
        actionsAtRisk: count,
        actionsReadyForMeasurement: count.nullable(),
        recommendedFocus,
      }),
      warnings: z.array(z.literal("DUE_MEASUREMENTS_OVERFLOW")).max(1),
    }),
  ],
);

export type ScheduledGrowthWeeklyReviewInput = z.output<
  typeof scheduledGrowthWeeklyReviewInputSchema
>;
export type GrowthWeeklyReviewResponse = z.output<
  typeof growthWeeklyReviewResponseSchema
>;
