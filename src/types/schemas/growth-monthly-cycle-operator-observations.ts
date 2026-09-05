import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });

export const GROWTH_MONTHLY_CYCLE_PREPARATION = [
  "not_assessed",
  "none",
  "minor",
  "substantial",
] as const;
export const GROWTH_MONTHLY_CYCLE_FAILURE = [
  "not_assessed",
  "none_observed",
  "explained",
  "unexplained",
] as const;
export const GROWTH_MONTHLY_CYCLE_DUPLICATE_SPAM = [
  "not_assessed",
  "not_observed",
  "observed",
] as const;

export const appendGrowthMonthlyCycleOperatorObservationSchema = z.strictObject(
  {
    runId: id,
    requestKey: z.string().uuid(),
    preparation: z.enum(GROWTH_MONTHLY_CYCLE_PREPARATION),
    failure: z.enum(GROWTH_MONTHLY_CYCLE_FAILURE),
    duplicateSpam: z.enum(GROWTH_MONTHLY_CYCLE_DUPLICATE_SPAM),
    note: z.string().trim().min(1).max(2000).nullable(),
  },
);

export const growthMonthlyCycleOperatorObservationDtoSchema = z.strictObject({
  id,
  runId: id,
  preparation: z.enum(GROWTH_MONTHLY_CYCLE_PREPARATION),
  failure: z.enum(GROWTH_MONTHLY_CYCLE_FAILURE),
  duplicateSpam: z.enum(GROWTH_MONTHLY_CYCLE_DUPLICATE_SPAM),
  note: z.string().trim().min(1).max(2000).nullable(),
  createdAt: timestamp,
});

export type AppendGrowthMonthlyCycleOperatorObservationInput = z.output<
  typeof appendGrowthMonthlyCycleOperatorObservationSchema
>;
