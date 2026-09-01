import { z } from "zod";
import {
  GROWTH_ACTION_STATUSES,
  isDirectGrowthActionTransition,
  type GrowthActionStatus,
} from "./growth-actions";
import type { GrowthChangeDto } from "./growth-change-log";
import type { GrowthMeasurementMetricType } from "./growth-measurements";

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

export const getGrowthWorkMeasurementSchema = z.strictObject({
  projectId: id,
  actionId: id,
});

export const startGrowthWorkMeasurementSchema = z.strictObject({
  projectId: id,
  actionId: id,
  expectedActionVersion: z.number().int().positive(),
  implementationChangeEventId: id,
});

export const collectGrowthWorkMeasurementSchema = z.strictObject({
  projectId: id,
  actionId: id,
  expectedActionVersion: z.number().int().positive(),
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

export type StartGrowthWorkMeasurementInput = z.infer<
  typeof startGrowthWorkMeasurementSchema
>;

export type CollectGrowthWorkMeasurementInput = z.infer<
  typeof collectGrowthWorkMeasurementSchema
>;

export type GrowthWorkMeasurementSchedule = {
  anchorAt: string;
  anchorDate: string;
  reportTimezone: string;
  baselineStart: string;
  baselineEnd: string;
  cooldownEnd: string;
  measurementStart: string;
  measurementEnd: string;
  longMeasurementEnd: string | null;
};

export type GrowthWorkMeasurementCandidate = {
  change: GrowthChangeDto;
  schedule: GrowthWorkMeasurementSchedule | null;
  unavailableReason: "future_change" | null;
};

export type GrowthWorkMeasurementMetric = {
  metricType: GrowthMeasurementMetricType;
  displayTarget: string | null;
  isPrimary: boolean;
};

export type GrowthWorkMeasurementPlanMetric = GrowthWorkMeasurementMetric & {
  observations: GrowthWorkMeasurementObservation[];
  comparison: GrowthWorkMeasurementComparison;
};

type GrowthWorkMeasurementObservation = {
  periodType: "baseline" | "measurement" | "long_term";
  value: number;
  completeness: number;
  capturedAt: string;
};

type GrowthWorkMeasurementComparison = {
  baselineValue: number | null;
  measurementValue: number | null;
  absoluteDelta: number | null;
  percentDelta: number | null;
  longTermValue: number | null;
  longTermAbsoluteDelta: number | null;
  longTermPercentDelta: number | null;
};

export type GrowthWorkMeasurementCollectionPeriod = {
  periodType: "baseline" | "measurement" | "long_term";
  startDate: string;
  endDate: string;
  sourceAvailableOn: string;
  status: "waiting" | "ready" | "collected" | "not_collected" | "inconsistent";
  collectedMetricCount: number;
  expectedMetricCount: number;
};

export type GrowthWorkMeasurementCollection = {
  state:
    | "missing_connection"
    | "unsupported"
    | "inconsistent"
    | "waiting"
    | "ready"
    | "collected"
    | "closed";
  canCollect: boolean;
  nextAvailableOn: string | null;
  periods: GrowthWorkMeasurementCollectionPeriod[];
};

export type GrowthWorkMeasurementConfounderCandidate = {
  id: string;
  changeType: GrowthChangeDto["changeType"];
  description: string;
  happenedAt: string;
  matchedDisplayUrls: Array<string | null>;
};

export type GrowthWorkMeasurementConfounders = {
  state: "none" | "complete" | "overflow" | "unavailable" | "closed";
  intervalStart: string;
  intervalEnd: string;
  candidates: GrowthWorkMeasurementConfounderCandidate[];
  limit: number;
};

export type GrowthWorkMeasurementPlan = {
  id: string;
  status: "active" | "completed";
  actionVersion: number;
  implementationChange: GrowthChangeDto | null;
  schedule: GrowthWorkMeasurementSchedule;
  metrics: GrowthWorkMeasurementPlanMetric[];
  collection: GrowthWorkMeasurementCollection;
  confounders: GrowthWorkMeasurementConfounders;
  dueDate: string;
  result: {
    outcome:
      | "strong_positive"
      | "positive"
      | "inconclusive"
      | "neutral"
      | "negative"
      | "strong_negative"
      | "not_measurable";
    confidence: number;
    summary: string;
    evaluatedAt: string;
  } | null;
};

export type GrowthWorkMeasurementState =
  | "not_ready"
  | "needs_change"
  | "unmeasurable_targets"
  | "eligible"
  | "active"
  | "completed"
  | "inconsistent";

export type GrowthWorkMeasurementOverview = {
  actionId: string;
  actionStatus: GrowthActionStatus;
  stateVersion: number;
  state: GrowthWorkMeasurementState;
  targetCount: number;
  candidates: GrowthWorkMeasurementCandidate[];
  proposedMetrics: GrowthWorkMeasurementMetric[];
  plan: GrowthWorkMeasurementPlan | null;
  limit: number;
};
