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
