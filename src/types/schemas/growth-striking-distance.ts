import { z } from "zod";

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .superRefine((value, context) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.valueOf()) ||
      parsed.toISOString().slice(0, 10) !== value
    )
      context.addIssue({
        code: "custom",
        message: "Use a valid calendar date",
      });
  });

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const count = z.number().finite().int().nonnegative().safe();

export const growthStrikingDistanceWindowSchema = z
  .strictObject({ startDate: calendarDate, endDate: calendarDate })
  .superRefine((value, context) => {
    if (value.startDate > value.endDate)
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Period end must be on or after period start",
      });
  });

export const growthStrikingDistanceRowSchema = z.strictObject({
  query: boundedText(500),
  page: boundedText(4096),
  clicks: count,
  impressions: count,
  position: z.number().finite().positive(),
});

export const growthStrikingDistanceInventorySchema = z
  .strictObject({
    projectId: boundedText(100),
    property: boundedText(2048),
    capturedAt: z.string().datetime({ offset: true }),
    baselineWindow: growthStrikingDistanceWindowSchema,
    currentWindow: growthStrikingDistanceWindowSchema,
    baseline: z.strictObject({
      retrievalStatus: z.enum(["exhausted", "capped"]),
      requestsUsed: z.number().int().min(1).max(10),
      rows: z.array(growthStrikingDistanceRowSchema).max(10_000),
    }),
    current: z.strictObject({
      retrievalStatus: z.enum(["exhausted", "capped"]),
      requestsUsed: z.number().int().min(1).max(10),
      rows: z.array(growthStrikingDistanceRowSchema).max(10_000),
    }),
  })
  .superRefine((value, context) => {
    const baselineDays = daysInclusive(value.baselineWindow);
    const currentDays = daysInclusive(value.currentWindow);
    if (baselineDays !== 28 || currentDays !== 28)
      context.addIssue({
        code: "custom",
        message: "Striking-distance windows must each be 28 days",
      });
    if (value.baselineWindow.endDate >= value.currentWindow.startDate)
      context.addIssue({ code: "custom", message: "Windows must not overlap" });
    if (
      nextDate(value.baselineWindow.endDate) !== value.currentWindow.startDate
    )
      context.addIssue({ code: "custom", message: "Windows must be adjacent" });
    for (const window of [value.baseline, value.current]) {
      const coordinates = new Set<string>();
      for (const row of window.rows) {
        const coordinate = `${row.query}\u0000${row.page}`;
        if (coordinates.has(coordinate))
          context.addIssue({
            code: "custom",
            message: "Duplicate query/page row",
          });
        coordinates.add(coordinate);
      }
    }
  });

function daysInclusive(window: { startDate: string; endDate: string }) {
  return (
    (Date.parse(`${window.endDate}T00:00:00.000Z`) -
      Date.parse(`${window.startDate}T00:00:00.000Z`)) /
      86_400_000 +
    1
  );
}

function nextDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export type GrowthStrikingDistanceInventory = z.infer<
  typeof growthStrikingDistanceInventorySchema
>;
