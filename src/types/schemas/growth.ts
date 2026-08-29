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
