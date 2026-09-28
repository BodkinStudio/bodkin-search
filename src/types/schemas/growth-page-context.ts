import { z } from "zod";
import {
  GROWTH_CHANGE_EVENT_SOURCES,
  GROWTH_CHANGE_EVENT_TYPES,
} from "./growth-change-events";

const id = z.string().trim().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const safeText = (max: number) =>
  z.strictObject({
    value: z.string().min(1).max(max),
    redacted: z.boolean(),
    truncated: z.boolean(),
  });
const collectionShape = <T extends z.ZodType>(item: T, max = 5) => ({
  items: z.array(item).max(max),
  hasMore: z.boolean(),
});
const collection = <T extends z.ZodType>(item: T, max = 5) =>
  z.strictObject(collectionShape(item, max));
const workflowCollection = <T extends z.ZodType>(item: T) =>
  z.strictObject({
    matchScope: z.literal("growth_workflow_host_path"),
    stateScope: z.literal("current_not_historical"),
    ...collectionShape(item),
  });
const gscContextShape = {
  source: z.literal("live_gsc_final"),
  matchScope: z.literal("gsc_parsed_requested_url"),
  calendar: z.literal("America/Los_Angeles"),
  searchType: z.literal("web"),
  dataState: z.literal("final"),
  startDate: date,
  endDate: date,
} as const;

export const growthPageContextDtoSchema = z.strictObject({
  asOf: timestamp,
  consistency: z.literal("current_not_snapshot"),
  page: z.strictObject({
    displayUrl: z.strictObject({
      value: z.string().url().nullable(),
      queryOrFragmentOmitted: z.boolean(),
      withheld: z.boolean(),
    }),
    identityScopes: z.tuple([
      z.literal("key_page_exact"),
      z.literal("growth_workflow_host_path"),
      z.literal("gsc_parsed_requested_url"),
      z.literal("rank_common_host_path_variants"),
    ]),
  }),
  curation: z.discriminatedUnion("state", [
    z.strictObject({
      state: z.literal("not_curated"),
      matchScope: z.literal("key_page_exact"),
    }),
    z.strictObject({
      state: z.literal("curated"),
      matchScope: z.literal("key_page_exact"),
      role: z.enum(["hub", "spoke", "money", "other"]),
      commercialWeight: z.number().int().min(1).max(5).nullable(),
      protected: z.boolean(),
      activelyOptimized: z.boolean(),
      topic: safeText(200).nullable(),
      notes: safeText(500).nullable(),
      updatedAt: timestamp,
    }),
  ]),
  searchPerformance: z.discriminatedUnion("state", [
    z.strictObject({
      state: z.literal("not_connected"),
      ...gscContextShape,
    }),
    z.strictObject({
      state: z.literal("reconnect_required"),
      ...gscContextShape,
    }),
    z.strictObject({ state: z.literal("unavailable"), ...gscContextShape }),
    z.strictObject({
      state: z.literal("available"),
      ...gscContextShape,
      aggregate: z.discriminatedUnion("state", [
        z.strictObject({ state: z.literal("not_reported") }),
        z.strictObject({
          state: z.literal("reported"),
          clicks: z.number().finite().nonnegative(),
          impressions: z.number().finite().nonnegative(),
          ctr: z.number().finite().min(0).max(1),
          position: z.number().finite().nonnegative(),
        }),
      ]),
      queries: collection(
        z.strictObject({
          query: safeText(300),
          clicks: z.number().finite().nonnegative(),
          impressions: z.number().finite().nonnegative(),
          ctr: z.number().finite().min(0).max(1),
          position: z.number().finite().nonnegative(),
        }),
        10,
      ),
    }),
  ]),
  recommendations: workflowCollection(
    z.strictObject({
      id,
      status: z.enum(["proposed", "snoozed", "accepted"]),
      title: safeText(300),
      priorityScore: z.number().finite().nonnegative(),
      createdAt: timestamp,
    }),
  ),
  actions: workflowCollection(
    z.strictObject({
      id,
      status: z.enum([
        "approved",
        "ready",
        "in_progress",
        "blocked",
        "implemented",
        "measuring",
      ]),
      title: safeText(300),
      priorityScore: z.number().finite().nonnegative(),
      dueAt: timestamp,
      updatedAt: timestamp,
    }),
  ),
  changes: workflowCollection(
    z.strictObject({
      id,
      source: z.enum(GROWTH_CHANGE_EVENT_SOURCES),
      changeType: z.enum(GROWTH_CHANGE_EVENT_TYPES),
      description: safeText(500),
      happenedAt: timestamp,
    }),
  ),
  measurements: workflowCollection(
    z.strictObject({
      id,
      actionId: id,
      reportTimezone: z.string().min(1).max(100),
      measurementEnd: date,
      longMeasurementEnd: date.nullable(),
      actionIntegrity: z.enum([
        "consistent",
        "action_missing",
        "action_state_mismatch",
        "action_version_mismatch",
      ]),
    }),
  ),
  ranks: z.strictObject({
    source: z.literal("saved_rank_snapshots"),
    matchScope: z.literal("rank_common_host_path_variants"),
    ...collectionShape(
      z.strictObject({
        keyword: safeText(300),
        device: z.enum(["desktop", "mobile"]),
        position: z.number().int().positive().nullable(),
        checkedAt: timestamp,
      }),
      10,
    ),
  }),
});

export type GrowthPageContextDto = z.output<typeof growthPageContextDtoSchema>;
