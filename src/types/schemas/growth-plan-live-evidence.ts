import { z } from "zod";

// Live evidence for the Growth Plan: Search Console page series and keyword
// positions derived from what the plan's actions target. Re-exported from
// ./growth-plan so existing imports keep working.

const id = z.string().trim().min(1).max(100);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// ---------- Evidence series (charts derived from what the actions target) ----------

const monthKey = z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM");

export type GrowthEvidenceMonth = z.infer<typeof growthEvidenceMonthSchema>;
export type GrowthEvidencePosition = z.infer<
  typeof growthEvidencePositionSchema
>;
export type GrowthEvidenceKeyword = z.infer<typeof growthEvidenceKeywordSchema>;

export const growthEvidenceMonthSchema = z.strictObject({
  month: monthKey,
  clicks: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
});

export const growthEvidencePositionSchema = z.strictObject({
  // One entry per rank-tracking config that tracks the keyword. A domain can
  // have several configs (one per location), so columns key on configId.
  configId: id,
  domain: z.string(),
  locationCode: z.number().int().nullable(),
  locationName: z.string().nullable(),
  device: z.enum(["desktop", "mobile"]),
  // True only when the config's domain is the project's own domain.
  isProject: z.boolean(),
  // Null when the domain is tracked but the keyword was not found in its
  // latest check; domains that are not rank-tracked are omitted entirely.
  position: z.number().int().min(1).nullable(),
  checkedAt: z.string().nullable(),
});

export const growthEvidenceKeywordSchema = z.strictObject({
  keyword: z.string(),
  searchVolume: z.number().int().nonnegative().nullable(),
  positions: z.array(growthEvidencePositionSchema),
});

export const growthPlanEvidenceSeriesDtoSchema = z.strictObject({
  scope: z.enum(["plan", "workstream"]),
  workstreamId: id.nullable(),
  pages: z.strictObject({
    // no_data: Search Console answered but every month is zero, which usually
    // means the stored URL is not the form Search Console reports. Never chart
    // it as a measured series.
    // capped: this slice's URLs were not read because the plan has more URL
    // targets than the per-request cap; urls/totalUrls still describe the slice.
    state: z.enum([
      "available",
      "no_data",
      "not_connected",
      "unavailable",
      "no_targets",
      "capped",
    ]),
    // The URLs actually queried (canonical form), at most 10.
    urls: z.array(z.string()),
    // Distinct URL targets before the cap, so the UI can say "10 of 30".
    totalUrls: z.number().int().nonnegative(),
    // URLs whose read failed; the months still include the ones that succeeded.
    failedUrls: z.number().int().nonnegative(),
    // Complete calendar months only, oldest first, up to 16.
    months: z.array(growthEvidenceMonthSchema),
    window: z.strictObject({ start: dateOnly, end: dateOnly }).nullable(),
  }),
  keywords: z.strictObject({
    state: z.enum(["available", "no_targets", "capped"]),
    items: z.array(growthEvidenceKeywordSchema),
    totalKeywords: z.number().int().nonnegative(),
    rankTracked: z.boolean(),
  }),
});
export type GrowthPlanEvidenceSeriesDto = z.infer<
  typeof growthPlanEvidenceSeriesDtoSchema
>;

// One request computes the plan-wide series and every workstream's slice,
// reading each distinct URL from Search Console at most once.
export const growthPlanEvidenceDtoSchema = z.strictObject({
  plan: growthPlanEvidenceSeriesDtoSchema,
  workstreams: z.array(growthPlanEvidenceSeriesDtoSchema),
});
export type GrowthPlanEvidenceDto = z.infer<typeof growthPlanEvidenceDtoSchema>;

export const getGrowthPlanEvidenceInputSchema = z.strictObject({
  projectId: id,
});
