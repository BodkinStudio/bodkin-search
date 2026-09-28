import { z } from "zod";

const GROWTH_REPORT_CADENCES = ["weekly", "monthly"] as const;
const growthReportCadenceSchema = z.enum(GROWTH_REPORT_CADENCES);

export const GROWTH_SETTINGS_DEFAULTS = {
  growthEnabled: false,
  reportTimezone: "UTC",
  reportCadence: "monthly",
  reportDay: 1,
  defaultBaselineDays: 28,
  defaultCooldownDays: 7,
  defaultPrimaryWindowDays: 28,
  defaultLongWindowDays: 55,
} as const;

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const growthSettingsShape = {
  growthEnabled: z.boolean(),
  reportTimezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isValidTimeZone, "Use a valid IANA timezone, like Europe/London"),
  reportCadence: growthReportCadenceSchema,
  reportDay: z.number().int().min(1).max(28),
  defaultBaselineDays: z.number().int().min(1).max(365),
  defaultCooldownDays: z.number().int().min(0).max(365),
  defaultPrimaryWindowDays: z.number().int().min(1).max(365),
  // Null explicitly disables the optional long observation window.
  defaultLongWindowDays: z.number().int().min(1).max(365).nullable(),
} as const;

const validateReportDay = (
  value: { reportCadence: "weekly" | "monthly"; reportDay: number },
  context: z.RefinementCtx,
) => {
  if (value.reportCadence === "weekly" && value.reportDay > 7) {
    context.addIssue({
      code: "custom",
      path: ["reportDay"],
      message: "Weekly report day must be an ISO weekday from 1 to 7",
    });
  }
};

export const growthSettingsInputSchema = z
  .object(growthSettingsShape)
  .superRefine(validateReportDay);

export const getGrowthSettingsSchema = z.object({
  projectId: z.string().min(1),
});

export const updateGrowthSettingsSchema = z
  .object({
    projectId: z.string().min(1),
    ...growthSettingsShape,
  })
  .superRefine(validateReportDay);

export type GrowthSettingsInput = z.infer<typeof growthSettingsInputSchema>;

export const GROWTH_RUN_TYPES = [
  "daily_monitor",
  "weekly_review",
  "monthly_review",
  "measurement_review",
  "manual_analysis",
] as const;
export const GROWTH_RUN_STATUSES = [
  "running",
  "completed",
  "completed_with_errors",
  "failed",
] as const;
export const GROWTH_SIGNAL_SEVERITIES = [
  "info",
  "warning",
  "critical",
] as const;
export const GROWTH_EVIDENCE_KINDS = [
  "gsc_period",
  "ga4_period",
  "rank_snapshot",
  "audit_result",
  "backlink_snapshot",
  "manual_observation",
] as const;

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const slug = boundedText(100).regex(/^[a-z][a-z0-9_]*$/);
const isoDate = boundedText(10).superRefine((value, context) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    context.addIssue({ code: "custom", message: "Use YYYY-MM-DD" });
    return;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    context.addIssue({ code: "custom", message: "Use a valid calendar date" });
  }
});

const inclusivePeriod = {
  periodStart: isoDate,
  periodEnd: isoDate,
} as const;

const validateInclusivePeriod = (
  value: { periodStart: string; periodEnd: string },
  context: z.RefinementCtx,
) => {
  if (value.periodStart > value.periodEnd) {
    context.addIssue({
      code: "custom",
      path: ["periodEnd"],
      message: "Period end must be on or after period start",
    });
  }
};

export const createManualGrowthRunSchema = z
  .object({
    projectId: boundedText(100),
    runType: z.enum(GROWTH_RUN_TYPES),
    cadenceSlot: boundedText(200),
    ...inclusivePeriod,
    detectorVersion: boundedText(100),
    analysisVersion: boundedText(100).nullable().optional(),
    model: boundedText(200).nullable().optional(),
    promptVersion: boundedText(100).nullable().optional(),
  })
  .superRefine(validateInclusivePeriod);

const terminalGrowthRunSchema = z
  .object({
    projectId: boundedText(100),
    runId: boundedText(100),
    providerCostMinor: z.number().int().nonnegative().nullable().optional(),
    failureCode: boundedText(100).nullable().optional(),
    failureMessage: boundedText(1000).nullable().optional(),
  })
  .superRefine((value, context) => {
    const hasCode = value.failureCode != null;
    const hasMessage = value.failureMessage != null;
    if (hasCode !== hasMessage) {
      context.addIssue({
        code: "custom",
        path: ["failureCode"],
        message: "Failure code and message must be supplied together",
      });
    }
  });

export const completeGrowthRunSchema = terminalGrowthRunSchema.superRefine(
  (value, context) => {
    if (value.failureCode != null || value.failureMessage != null) {
      context.addIssue({
        code: "custom",
        path: ["failureCode"],
        message: "Completed runs cannot carry failure details",
      });
    }
  },
);
export const completeGrowthRunWithErrorsSchema =
  terminalGrowthRunSchema.superRefine((value, context) => {
    if (value.failureCode == null || value.failureMessage == null) {
      context.addIssue({
        code: "custom",
        path: ["failureCode"],
        message: "Failure code and message are required",
      });
    }
  });
export const recordGrowthSignalSchema = z
  .object({
    projectId: boundedText(100),
    runId: boundedText(100),
    signalType: slug,
    entityType: slug,
    entityRef: boundedText(500),
    metric: boundedText(200),
    severity: z.enum(GROWTH_SIGNAL_SEVERITIES),
    confidence: z.number().finite().min(0).max(1),
    ...inclusivePeriod,
    baselineValue: z.number().finite(),
    currentValue: z.number().finite(),
    deltaValue: z.number().finite(),
    deltaPercent: z.number().finite().nullable().optional(),
    evidenceKind: z.enum(GROWTH_EVIDENCE_KINDS),
    evidenceRef: boundedText(500),
    capturedAt: z.string().datetime({ offset: true }),
  })
  .superRefine(validateInclusivePeriod);

export type CreateManualGrowthRunInput = z.infer<
  typeof createManualGrowthRunSchema
>;
export type CompleteGrowthRunInput = z.infer<typeof completeGrowthRunSchema>;
export type CompleteGrowthRunWithErrorsInput = z.infer<
  typeof completeGrowthRunWithErrorsSchema
>;
export type RecordGrowthSignalInput = z.infer<typeof recordGrowthSignalSchema>;

export const GROWTH_RECOMMENDATION_STATUSES = [
  "proposed",
  "accepted",
  "dismissed",
  "snoozed",
  "merged",
  "superseded",
] as const;
export const GROWTH_DISMISSAL_REASONS = [
  "irrelevant",
  "already_planned",
  "not_commercially_important",
  "insufficient_evidence",
  "wrong_diagnosis",
  "too_much_effort",
  "duplicate",
  "defer",
] as const;
const collapsedText = (max: number) =>
  boundedText(max).transform((value) => value.replace(/\s+/g, " "));
const idList = z
  .array(boundedText(100))
  .min(1)
  .max(100)
  .transform((ids) => [...new Set(ids)].toSorted());

export const createGrowthInsightSchema = z
  .object({
    projectId: boundedText(100),
    runId: boundedText(100),
    creationKey: boundedText(200),
    title: boundedText(300),
    explanation: boundedText(5000),
    hypothesis: boundedText(5000),
    confidence: z.number().finite().min(0).max(1),
    signalIds: idList,
    model: boundedText(200).nullable().optional(),
    promptVersion: boundedText(100).nullable().optional(),
  })
  .superRefine((value, context) => {
    if ((value.model == null) !== (value.promptVersion == null))
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "Model and prompt version must be supplied together",
      });
  });

export const growthRecommendationTargetSchema = z.object({
  type: z.enum(["url", "keyword", "cluster", "site"]),
  value: boundedText(2000),
});
export const createGrowthRecommendationSchema = z
  .object({
    projectId: boundedText(100),
    runId: boundedText(100),
    creationKey: boundedText(200),
    title: boundedText(300),
    rationale: boundedText(5000),
    category: boundedText(100),
    insightIds: idList,
    impact: z.number().int().min(1).max(5),
    commercialRelevance: z.number().int().min(1).max(5),
    effort: z.number().int().min(1).max(5),
    urgency: z.number().int().min(1).max(3),
    confidence: z.number().finite().min(0).max(1),
    priorityScore: z.number().finite().nonnegative(),
    targets: z.array(growthRecommendationTargetSchema).min(1).max(100),
    steps: z.array(collapsedText(2000)).min(1).max(100),
    model: boundedText(200).nullable().optional(),
    promptVersion: boundedText(100).nullable().optional(),
  })
  .superRefine((value, context) => {
    if ((value.model == null) !== (value.promptVersion == null))
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "Model and prompt version must be supplied together",
      });
  });

export const reviewGrowthRecommendationSchema = z
  .object({
    projectId: boundedText(100),
    recommendationId: boundedText(100),
    expectedStatus: z.enum(GROWTH_RECOMMENDATION_STATUSES),
    expectedVersion: z.number().int().nonnegative(),
    status: z.enum(GROWTH_RECOMMENDATION_STATUSES),
    dismissalReason: z.enum(GROWTH_DISMISSAL_REASONS).optional(),
    snoozedUntil: z.string().datetime({ offset: true }).optional(),
    resolutionRecommendationId: boundedText(100).optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "dismissed" && !value.dismissalReason)
      context.addIssue({
        code: "custom",
        path: ["dismissalReason"],
        message: "Dismissal reason is required",
      });
    if (value.status === "snoozed" && !value.snoozedUntil)
      context.addIssue({
        code: "custom",
        path: ["snoozedUntil"],
        message: "Snooze timestamp is required",
      });
    if (
      ["merged", "superseded"].includes(value.status) &&
      !value.resolutionRecommendationId
    )
      context.addIssue({
        code: "custom",
        path: ["resolutionRecommendationId"],
        message: "Resolution recommendation is required",
      });
    if (value.resolutionRecommendationId === value.recommendationId)
      context.addIssue({
        code: "custom",
        path: ["resolutionRecommendationId"],
        message: "A recommendation cannot resolve itself",
      });
    if (!["dismissed"].includes(value.status) && value.dismissalReason)
      context.addIssue({
        code: "custom",
        path: ["dismissalReason"],
        message: "Dismissal metadata only applies to dismissed recommendations",
      });
    if (!["snoozed"].includes(value.status) && value.snoozedUntil)
      context.addIssue({
        code: "custom",
        path: ["snoozedUntil"],
        message: "Snooze metadata only applies to snoozed recommendations",
      });
    if (
      !["merged", "superseded"].includes(value.status) &&
      value.resolutionRecommendationId
    )
      context.addIssue({
        code: "custom",
        path: ["resolutionRecommendationId"],
        message:
          "Resolution metadata only applies to merged or superseded recommendations",
      });
  });
export type CreateGrowthInsightInput = z.infer<
  typeof createGrowthInsightSchema
>;
export type CreateGrowthRecommendationInput = z.infer<
  typeof createGrowthRecommendationSchema
>;
export type ReviewGrowthRecommendationInput = z.infer<
  typeof reviewGrowthRecommendationSchema
>;
