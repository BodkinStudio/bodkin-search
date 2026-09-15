import { z } from "zod";
import { growthEvidencePacketSchema } from "./growth-evidence-packet";
import {
  growthSearchPerformanceSnapshotSchema,
  priorityPageClickDeclineThresholdsSchema,
} from "./growth-search-performance";

export const getGrowthPreviewSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(100),
});

const page = {
  keyPageId: z.string().min(1).max(100),
  label: z.string().min(1).max(120),
  url: z.string().url().max(2048),
};

const previewPageSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...page,
    status: z.literal("flagged"),
    severity: z.enum(["warning", "critical"]),
    priority: z.number().int().nonnegative().safe(),
    evidence: growthEvidencePacketSchema,
  }),
  z.strictObject({
    ...page,
    status: z.literal("suppressed"),
    reason: z.enum([
      "retrieval_capped",
      "site_context_incomplete",
      "missing_observation",
      "zero_baseline",
      "low_baseline",
      "not_material",
      "site_wide_decline",
    ]),
    baselineClicks: z.number().int().nonnegative().safe().nullable(),
    currentClicks: z.number().int().nonnegative().safe().nullable(),
  }),
]);

const period = growthSearchPerformanceSnapshotSchema.shape.sourceWindow;

export const growthPreviewSchema = z.strictObject({
  mode: z.literal("sample"),
  fixtureVersion: z.literal("growth-preview-v1"),
  site: z.literal("example.com"),
  sourceWindow: period,
  baselineWindow: period,
  currentWindow: period,
  capturedAt: z.string().datetime({ offset: true }),
  calendar: z.literal("America/Los_Angeles"),
  thresholds: priorityPageClickDeclineThresholdsSchema,
  pages: z.array(previewPageSchema).max(100),
});

export type GrowthPreview = z.infer<typeof growthPreviewSchema>;
export type GrowthPreviewPage = GrowthPreview["pages"][number];
