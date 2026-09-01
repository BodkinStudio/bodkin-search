import { z } from "zod";
import { GROWTH_CHANGE_EVENT_TYPES } from "./growth-change-events";

const id = z.string().trim().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });
const growthRecentChangesCursorSchema = z.strictObject({
  happenedAt: timestamp,
  id,
});

export const growthRecentChangesInputShape = {
  projectId: id.describe("Authorized project ID"),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: growthRecentChangesCursorSchema.optional(),
} as const;

export const growthRecentChangesRequestSchema = z
  .strictObject(growthRecentChangesInputShape)
  .transform((request) =>
    request.cursor
      ? {
          ...request,
          cursor: {
            ...request.cursor,
            happenedAt: new Date(request.cursor.happenedAt).toISOString(),
          },
        }
      : request,
  );

const displayUrl = z.strictObject({
  value: z.string().url().max(2048).nullable(),
  queryOrFragmentOmitted: z.boolean(),
  withheld: z.boolean(),
});
const change = z.strictObject({
  id,
  source: z.literal("manual"),
  changeType: z.enum(GROWTH_CHANGE_EVENT_TYPES),
  description: z.string().min(1).max(2000),
  descriptionRedacted: z.boolean(),
  descriptionTruncated: z.boolean(),
  happenedAt: timestamp,
  recordedAt: timestamp,
  urlCount: z.number().int().min(1).max(100),
  displayUrls: z.array(displayUrl).max(5),
  displayUrlsOmitted: z.boolean(),
  displayUrlsWithheld: z.boolean(),
});
export const growthRecentChangesPageDtoSchema = z.strictObject({
  changes: z.array(change).max(50),
  limit: z.number().int().min(1).max(50),
  hasMore: z.boolean(),
  nextCursor: growthRecentChangesCursorSchema.nullable(),
});
export type GrowthRecentChangesRequest = z.output<
  typeof growthRecentChangesRequestSchema
>;
export type GrowthRecentChangesPageDto = z.output<
  typeof growthRecentChangesPageDtoSchema
>;
