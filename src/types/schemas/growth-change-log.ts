import { z } from "zod";
import {
  GROWTH_CHANGE_EVENT_TYPES,
  type GrowthChangeEventType,
} from "./growth-change-events";

const id = z.string().trim().min(1).max(100);

function isUtcDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

const utcDay = z
  .string()
  .refine(isUtcDay, "Use a valid UTC date in YYYY-MM-DD format")
  .refine(
    (value) => value <= new Date().toISOString().slice(0, 10),
    "The change date cannot be in the future",
  );

export const getGrowthChangeLogSchema = z.strictObject({ projectId: id });

export const recordGrowthPageChangeSchema = z.strictObject({
  projectId: id,
  requestKey: z.string().uuid(),
  keyPageId: z.string().trim().min(1, "Choose a priority page.").max(100),
  happenedOn: utcDay,
  changeType: z.enum(GROWTH_CHANGE_EVENT_TYPES),
  description: z
    .string()
    .trim()
    .min(1, "Describe what changed.")
    .max(5000, "Keep the description to 5,000 characters or fewer."),
});

export type RecordGrowthPageChangeInput = z.infer<
  typeof recordGrowthPageChangeSchema
>;
export type GrowthPageChangeType = GrowthChangeEventType;
