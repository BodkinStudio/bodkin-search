import { z } from "zod";
import { GROWTH_RUN_STATUSES, GROWTH_RUN_TYPES } from "./growth";

const id = z.string().trim().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();

export const growthRunInspectorRequestSchema = z.strictObject({
  projectId: id,
});

const inspectedRunSchema = z
  .strictObject({
    id,
    runType: z.enum(GROWTH_RUN_TYPES),
    trigger: z.enum(["manual", "scheduled"]),
    status: z.enum(GROWTH_RUN_STATUSES),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    startedAt: timestamp,
    completedAt: timestamp.nullable(),
    durationMs: count,
    detectorVersion: id,
    analysisVersion: id.nullable(),
    providerCostMinor: count.nullable(),
    failure: z
      .strictObject({ code: id, message: z.string().trim().min(1).max(1000) })
      .nullable(),
    entities: z.strictObject({
      signals: count,
      insights: count,
      recommendations: count,
      linkedActions: count,
    }),
  })
  .superRefine((run, context) => {
    const terminal = run.status !== "running";
    if (terminal !== (run.completedAt !== null))
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "Completion time must match the run status",
      });
    const failed =
      run.status === "failed" || run.status === "completed_with_errors";
    if (failed !== (run.failure !== null))
      context.addIssue({
        code: "custom",
        path: ["failure"],
        message: "Failure details must match the run status",
      });
  });

export const growthRunInspectorDtoSchema = z.strictObject({
  asOf: timestamp,
  limit: z.literal(20),
  hasMore: z.boolean(),
  runs: z.array(inspectedRunSchema).max(20),
});

export type GrowthRunInspectorDto = z.output<
  typeof growthRunInspectorDtoSchema
>;
