import { z } from "zod";
import { growthRecommendationTargetSchema } from "./growth";

export const GROWTH_ACTION_STATUSES = [
  "approved",
  "ready",
  "in_progress",
  "blocked",
  "implemented",
  "measuring",
  "evaluated",
  "cancelled",
] as const;

export type GrowthActionStatus = (typeof GROWTH_ACTION_STATUSES)[number];

const LEGAL_GROWTH_ACTION_TRANSITIONS: Record<
  GrowthActionStatus,
  readonly GrowthActionStatus[]
> = {
  approved: ["ready", "cancelled"],
  ready: ["in_progress", "cancelled"],
  in_progress: ["blocked", "implemented", "cancelled"],
  blocked: ["in_progress", "implemented", "cancelled"],
  implemented: ["measuring"],
  measuring: ["evaluated"],
  evaluated: [],
  cancelled: [],
};

export function isLegalGrowthActionTransition(
  from: GrowthActionStatus,
  to: GrowthActionStatus,
) {
  return LEGAL_GROWTH_ACTION_TRANSITIONS[from].includes(to);
}

const GROWTH_ACTION_ACTOR_TYPES = ["user", "agent", "system"] as const;

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const actorFields = {
  actorType: z.enum(GROWTH_ACTION_ACTOR_TYPES),
  actorId: boundedText(200),
  note: boundedText(5000).nullable().optional(),
} as const;

export const createGrowthActionSchema = z.object({
  projectId: boundedText(100),
  recommendationId: boundedText(100),
  creationKey: boundedText(200),
  title: boundedText(300),
  description: boundedText(5000),
  dueAt: z.string().datetime({ offset: true }),
  targets: z.array(growthRecommendationTargetSchema).min(1).max(100),
  ...actorFields,
});

export const transitionGrowthActionSchema = z
  .object({
    projectId: boundedText(100),
    actionId: boundedText(100),
    expectedStatus: z.enum(GROWTH_ACTION_STATUSES),
    expectedVersion: z.number().int().nonnegative(),
    status: z.enum(GROWTH_ACTION_STATUSES),
    ...actorFields,
  })
  .superRefine((value, context) => {
    if ((value.expectedVersion === 0) !== (value.expectedStatus === "approved"))
      context.addIssue({
        code: "custom",
        path: ["expectedVersion"],
        message: "Only an approved Action can have version zero",
      });
    if (!isLegalGrowthActionTransition(value.expectedStatus, value.status))
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Growth Action transition is not allowed",
      });
  });

export type CreateGrowthActionInput = z.infer<typeof createGrowthActionSchema>;
export type TransitionGrowthActionInput = z.infer<
  typeof transitionGrowthActionSchema
>;
