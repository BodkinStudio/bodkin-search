import { z } from "zod";
import {
  GROWTH_ACTION_STATUSES,
  isDirectGrowthActionTransition,
  type GrowthActionStatus,
} from "./growth-actions";
import type { GrowthChangeDto } from "./growth-change-log";

const id = z.string().trim().min(1).max(100);
const note = z.string().trim().min(1).max(5000);

export const updateGrowthWorkStatusSchema = z
  .strictObject({
    projectId: id,
    actionId: id,
    expectedStatus: z.enum(GROWTH_ACTION_STATUSES),
    expectedVersion: z.number().int().nonnegative(),
    status: z.enum(GROWTH_ACTION_STATUSES),
    note: note.optional(),
  })
  .superRefine((value, context) => {
    if ((value.expectedVersion === 0) !== (value.expectedStatus === "approved"))
      context.addIssue({
        code: "custom",
        path: ["expectedVersion"],
        message: "Only an approved Action can have version zero",
      });
    if (!isDirectGrowthActionTransition(value.expectedStatus, value.status))
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Growth Action transition is not allowed",
      });
  });

export const getGrowthWorkHistorySchema = z.strictObject({
  projectId: id,
  actionId: id,
});

export const getGrowthWorkChangesSchema = z.strictObject({
  projectId: id,
  actionId: id,
});

export const linkGrowthWorkChangeSchema = z.strictObject({
  projectId: id,
  actionId: id,
  changeEventId: id,
});

export type UpdateGrowthWorkStatusInput = z.infer<
  typeof updateGrowthWorkStatusSchema
>;

export type GrowthWorkHistoryEvent = {
  version: number;
  eventType: "created" | "status_changed";
  fromStatus: GrowthActionStatus | null;
  toStatus: GrowthActionStatus;
  note: string | null;
  recordedAt: string;
};

export type GrowthWorkHistory = {
  actionId: string;
  events: GrowthWorkHistoryEvent[];
  limit: number;
};

export type GrowthWorkChange = GrowthChangeDto;

export type GrowthWorkChangesOverview = {
  actionId: string;
  linkedChanges: GrowthWorkChange[];
  availableChanges: GrowthWorkChange[];
  limit: number;
};

export type LinkGrowthWorkChangeInput = z.infer<
  typeof linkGrowthWorkChangeSchema
>;

export type GrowthWorkChangeLink = Pick<
  LinkGrowthWorkChangeInput,
  "actionId" | "changeEventId"
>;
