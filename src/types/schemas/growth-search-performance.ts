import { z } from "zod";

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .superRefine((value, context) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.valueOf()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      context.addIssue({
        code: "custom",
        message: "Use a valid calendar date",
      });
    }
  });

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const pageUrl = boundedText(4096).superRefine((value, context) => {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      context.addIssue({
        code: "custom",
        message: "Use a credential-free HTTP(S) URL",
      });
    }
  } catch {
    context.addIssue({ code: "custom", message: "Use a valid HTTP(S) URL" });
  }
});
const count = z.number().finite().int().nonnegative().safe();

export const growthSearchPerformanceObservationSchema = z.strictObject({
  rawUrl: pageUrl,
  date: calendarDate,
  clicks: count,
  impressions: count,
});

const growthSearchPerformanceKeyPageSchema = z.strictObject({
  id: boundedText(100),
  projectId: boundedText(100),
  url: pageUrl,
  commercialWeight: z.number().int().min(1).max(5).nullable(),
});

const growthSearchPerformanceWindowSchema = z
  .strictObject({ startDate: calendarDate, endDate: calendarDate })
  .superRefine((value, context) => {
    if (value.startDate > value.endDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Period end must be on or after period start",
      });
    }
  });

const growthSearchPerformanceSiteContextSchema = z.discriminatedUnion(
  "status",
  [
    z.strictObject({ status: z.literal("absent") }),
    z.strictObject({ status: z.literal("requested_incomplete") }),
    z.strictObject({
      status: z.literal("complete"),
      coverage: z.literal("sparse_date_inventory_v2").optional(),
      observations: z.array(
        z.strictObject({
          date: calendarDate,
          clicks: count,
          impressions: count,
        }),
      ),
    }),
  ],
);

const comparisonPeriodFactSchema = z.strictObject({
  reported: z.boolean(),
  clicks: count,
  impressions: count,
});

/**
 * Exact page-filter queries establish the meaning of an omitted date row for a
 * particular alias.  This is deliberately separate from the legacy observed
 * page/date feed: an omitted row in the latter is still unknown.
 */
const growthSearchPerformanceComparisonEvidenceSchema = z.strictObject({
  status: z.enum(["complete", "incomplete"]),
  collectionMethod: z.literal("exact_page_alias_date_inventory_v2"),
  baselineWindow: growthSearchPerformanceWindowSchema,
  currentWindow: growthSearchPerformanceWindowSchema,
  pages: z
    .array(
      z.strictObject({
        keyPageId: boundedText(100),
        aliases: z.array(pageUrl).min(1).max(4),
        baseline: comparisonPeriodFactSchema,
        current: comparisonPeriodFactSchema,
      }),
    )
    .max(100),
});

export const growthSearchPerformanceSnapshotSchema = z
  .strictObject({
    projectId: boundedText(100),
    property: boundedText(2048),
    capturedAt: z.string().datetime({ offset: true }),
    source: z.strictObject({
      calendar: z.literal("America/Los_Angeles"),
      searchType: z.literal("web"),
      dataState: z.literal("final"),
      pageRowsMayBeOmitted: z.literal(true),
    }),
    sourceWindow: growthSearchPerformanceWindowSchema,
    retrievalStatus: z.enum(["exhausted", "capped"]),
    observations: z.array(growthSearchPerformanceObservationSchema).max(25000),
    keyPages: z.array(growthSearchPerformanceKeyPageSchema).max(100),
    siteContext: growthSearchPerformanceSiteContextSchema,
    comparisonEvidence:
      growthSearchPerformanceComparisonEvidenceSchema.optional(),
  })
  .superRefine((value, context) => {
    const sourceCoordinates = new Set<string>();
    for (const observation of value.observations) {
      if (
        observation.date < value.sourceWindow.startDate ||
        observation.date > value.sourceWindow.endDate
      ) {
        context.addIssue({
          code: "custom",
          message: "Observation is outside source window",
        });
      }
      const coordinate = `${observation.rawUrl}\u0000${observation.date}`;
      if (sourceCoordinates.has(coordinate)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate raw URL/day observation",
        });
      }
      sourceCoordinates.add(coordinate);
    }
    if (value.siteContext.status === "complete") {
      const siteDates = new Set<string>();
      for (const observation of value.siteContext.observations) {
        if (siteDates.has(observation.date))
          context.addIssue({
            code: "custom",
            message: "Duplicate site/day observation",
          });
        if (
          observation.date < value.sourceWindow.startDate ||
          observation.date > value.sourceWindow.endDate
        ) {
          context.addIssue({
            code: "custom",
            message: "Site observation is outside source window",
          });
        }
        siteDates.add(observation.date);
      }
    }
    const ids = new Set<string>();
    const urls = new Set<string>();
    for (const keyPage of value.keyPages) {
      if (keyPage.projectId !== value.projectId) {
        context.addIssue({
          code: "custom",
          message: "Key page belongs to another project",
        });
      }
      if (ids.has(keyPage.id) || urls.has(keyPage.url)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate key page identity",
        });
      }
      ids.add(keyPage.id);
      urls.add(keyPage.url);
    }
    if (value.comparisonEvidence) {
      const facts = new Set<string>();
      for (const page of value.comparisonEvidence.pages) {
        if (!ids.has(page.keyPageId) || facts.has(page.keyPageId)) {
          context.addIssue({
            code: "custom",
            message: "Invalid comparison page fact",
          });
        }
        facts.add(page.keyPageId);
        for (const period of [page.baseline, page.current])
          if (
            !period.reported &&
            (period.clicks !== 0 || period.impressions !== 0)
          )
            context.addIssue({
              code: "custom",
              message: "Not-reported comparison facts must be zero",
            });
      }
      if (
        value.comparisonEvidence.status === "complete" &&
        facts.size !== value.keyPages.length
      ) {
        context.addIssue({
          code: "custom",
          message: "Complete comparison evidence must cover every key page",
        });
      }
    }
  });

export const priorityPageClickDeclineThresholdsSchema = z.strictObject({
  minimumBaselineClicks: count.positive(),
  minimumLostClicks: count.positive(),
  minimumDeclinePercent: z.number().finite().positive().max(1),
  criticalLostClicks: count.positive(),
  criticalDeclinePercent: z.number().finite().positive().max(1),
  siteSuppressionMarginPercent: z.number().finite().min(0).max(1),
});

export const DEFAULT_PRIORITY_PAGE_CLICK_DECLINE_THRESHOLDS = {
  minimumBaselineClicks: 100,
  minimumLostClicks: 20,
  minimumDeclinePercent: 0.3,
  criticalLostClicks: 100,
  criticalDeclinePercent: 0.5,
  siteSuppressionMarginPercent: 0.1,
} as const;

export type GrowthSearchPerformanceSnapshot = z.infer<
  typeof growthSearchPerformanceSnapshotSchema
>;
