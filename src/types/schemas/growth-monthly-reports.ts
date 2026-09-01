import { z } from "zod";
import { GROWTH_REPORT_SECTION_TYPES } from "./growth-reports";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
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
  reportTimezone: z.string().min(1).max(100),
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
      report: z
        .object({
          status: z.enum(["draft", "published"]),
          version: z.number().int().positive(),
          generatedAt: z.string().datetime({ offset: true }),
          dataCutoffAt: z.string().datetime({ offset: true }),
          sections: z.array(section).length(GROWTH_REPORT_SECTION_TYPES.length),
        })
        .strict(),
    })
    .strict(),
]);

const projectRoute = z.strictObject({
  projectId: z.string().trim().min(1).max(100),
});

const echoedCoordinate = {
  periodStart: date,
  periodEnd: date,
  reportTimezone: z.string().min(1).max(100),
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

export type GrowthMonthlyReportExpectation = Omit<
  z.output<typeof buildGrowthMonthlyReportRequestSchema>,
  "projectId"
>;
export type GrowthMonthlyReportDto = z.output<
  typeof growthMonthlyReportDtoSchema
>;
