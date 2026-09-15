import { z } from "zod";
import { GROWTH_ACTOR_TYPES } from "./growth-actions";

export const GROWTH_CHANGE_EVENT_SOURCES = [
  "manual",
  "sherpa",
  "cms_webhook",
  "deployment",
] as const;

export const GROWTH_CHANGE_EVENT_TYPES = [
  "content_updated",
  "title_meta_updated",
  "page_created",
  "page_removed",
  "redirect_changed",
  "internal_links_changed",
  "template_changed",
  "structured_data_changed",
  "technical_fix",
  "design_restructure",
  "migration",
  "unknown",
  "mixed",
] as const;

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const recordManualGrowthChangeEventSchema = z.object({
  projectId: boundedText(100),
  creationKey: boundedText(200),
  changeType: z.enum(GROWTH_CHANGE_EVENT_TYPES),
  actorType: z.enum(GROWTH_ACTOR_TYPES),
  actorId: boundedText(200),
  description: boundedText(5000),
  happenedAt: z.string().datetime({ offset: true }),
  externalRef: boundedText(500).nullable().optional(),
  urls: z.array(boundedText(2000)).min(1).max(100),
});

export const linkGrowthActionChangeSchema = z.object({
  projectId: boundedText(100),
  actionId: boundedText(100),
  changeEventId: boundedText(100),
});

export type GrowthChangeEventType = (typeof GROWTH_CHANGE_EVENT_TYPES)[number];
export type RecordManualGrowthChangeEventInput = z.infer<
  typeof recordManualGrowthChangeEventSchema
>;
export type LinkGrowthActionChangeInput = z.infer<
  typeof linkGrowthActionChangeSchema
>;
