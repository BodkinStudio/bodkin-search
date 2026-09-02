import { z } from "zod";
import { GROWTH_CHANGE_EVENT_TYPES } from "./growth-change-events";
import { growthManualChangeDtoSchema } from "./growth-recent-changes";

const id = z.string().trim().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });
const growthRecordChangeInputShape = {
  projectId: id.describe("Authorized OpenSEO project ID"),
  requestKey: z
    .string()
    .uuid()
    .describe(
      "Client-generated idempotency UUID. Reuse it only to retry this exact immutable Change Event fact.",
    ),
  changeType: z
    .enum(GROWTH_CHANGE_EVENT_TYPES)
    .describe("Closed classification for the website change."),
  description: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .describe(
      "Plain-language description of what changed (1-5,000 characters).",
    ),
  happenedAt: timestamp.describe(
    "Caller-supplied occurrence timestamp with a UTC offset. It must not be in the future and is not independently verified.",
  ),
  urls: z
    .array(z.string().trim().url().max(2000))
    .min(1)
    .max(100)
    .describe(
      "1-100 absolute URLs belonging to the project domain. Query strings and fragments are omitted from the saved canonical URLs.",
    ),
} as const;
export const growthRecordChangeRequestSchema = z.strictObject(
  growthRecordChangeInputShape,
);
export const growthRecordedChangeDtoSchema = growthManualChangeDtoSchema;
export type GrowthRecordChangeRequest = z.infer<
  typeof growthRecordChangeRequestSchema
>;
