import { z } from "zod";
import { GROWTH_REPORT_SECTION_TYPES } from "./growth-reports";

const date = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}, "Expected a real calendar date");
const timezone = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Expected an IANA timezone");
const fact = z
  .object({
    label: z.string().min(1).max(200),
    value: z.union([
      z.string().min(1).max(2000),
      z.number().finite(),
      z.boolean(),
      z.null(),
    ]),
  })
  .strict();
const item = z
  .object({
    title: z.string().min(1).max(300),
    summary: z.string().min(1).max(5000),
    facts: z.array(fact),
  })
  .strict();
const section = z
  .object({
    sectionType: z.enum(GROWTH_REPORT_SECTION_TYPES),
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(5000),
    items: z.array(item),
  })
  .strict();
const common = {
  periodStart: date,
  periodEnd: date,
  reportTimezone: timezone,
};

/** Deliberately allowlisted projection of a frozen monthly report for the UI. */
export const growthMonthlyReportDtoSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("ready"), ...common }).strict(),
  z
    .object({
      state: z.literal("no_activity"),
      ...common,
      message: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      state: z.literal("report"),
      ...common,
      report: z.discriminatedUnion("status", [
        z
          .object({
            status: z.literal("draft"),
            version: z.number().int().positive(),
            generatedAt: z.string().datetime({ offset: true }),
            dataCutoffAt: z.string().datetime({ offset: true }),
            sections: z
              .array(section)
              .length(GROWTH_REPORT_SECTION_TYPES.length),
          })
          .strict(),
        z
          .object({
            status: z.literal("published"),
            version: z.number().int().positive(),
            generatedAt: z.string().datetime({ offset: true }),
            dataCutoffAt: z.string().datetime({ offset: true }),
            publishedAt: z.string().datetime({ offset: true }),
            sections: z
              .array(section)
              .length(GROWTH_REPORT_SECTION_TYPES.length),
          })
          .strict(),
      ]),
    })
    .strict(),
]);

const projectRoute = z.strictObject({
  projectId: z.string().trim().min(1).max(100),
});

const echoedCoordinate = {
  periodStart: date,
  periodEnd: date,
  reportTimezone: timezone,
};

/** A read may be a normal current-month read or an exact retry/recovery read. */
export const getGrowthMonthlyReportRequestSchema = z.union([
  projectRoute,
  z.strictObject({
    projectId: projectRoute.shape.projectId,
    ...echoedCoordinate,
  }),
]);

/** Building is deliberate and can only retry the complete state issued by the server. */
export const buildGrowthMonthlyReportRequestSchema = z.strictObject({
  projectId: projectRoute.shape.projectId,
  ...echoedCoordinate,
});

/** Publication can only address the exact server-issued monthly v1 coordinate. */
export const publishGrowthMonthlyReportRequestSchema = z
  .strictObject({
    projectId: projectRoute.shape.projectId,
    ...echoedCoordinate,
    version: z.literal(1),
  })
  .superRefine((value, context) => {
    if (!/^\d{4}-\d{2}-01$/.test(value.periodStart)) {
      context.addIssue({
        code: "custom",
        path: ["periodStart"],
        message: "Expected the first day of a month",
      });
      return;
    }
    const next = new Date(`${value.periodStart}T00:00:00.000Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(0);
    if (next.toISOString().slice(0, 10) !== value.periodEnd)
      context.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "Expected the final day of the same month",
      });
  });

export type GrowthMonthlyReportExpectation = Omit<
  z.output<typeof buildGrowthMonthlyReportRequestSchema>,
  "projectId"
>;
export type GrowthMonthlyPublicationRequest = z.output<
  typeof publishGrowthMonthlyReportRequestSchema
>;
export type GrowthMonthlyReportDto = z.output<
  typeof growthMonthlyReportDtoSchema
>;
