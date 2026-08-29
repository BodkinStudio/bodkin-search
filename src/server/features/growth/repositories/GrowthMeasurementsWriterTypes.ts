import type {
  growthActionEvents,
  growthMeasurementMetrics,
  growthMeasurementObservations,
  growthMeasurementPlans,
  growthMeasurementResults,
} from "@/db/schema";

export type MeasurementMetricType =
  typeof growthMeasurementMetrics.$inferSelect.metricType;
export type MeasurementEntityType =
  typeof growthMeasurementMetrics.$inferSelect.entityType;
export type MeasurementPeriodType =
  typeof growthMeasurementObservations.$inferSelect.periodType;
export type MeasurementEvidenceKind =
  typeof growthMeasurementObservations.$inferSelect.evidenceKind;
export type MeasurementOutcome =
  typeof growthMeasurementResults.$inferSelect.outcome;
export type MeasurementComparisonMode =
  typeof growthMeasurementPlans.$inferSelect.comparisonMode;
export type ActionActorType = typeof growthActionEvents.$inferSelect.actorType;

export type MeasurementMetricWrite = {
  id: string;
  metricType: MeasurementMetricType;
  entityType: MeasurementEntityType;
  entityKey: string;
  isPrimary: boolean;
};

export type StartMeasurementGraphInput = {
  id: string;
  projectId: string;
  actionId: string;
  factHash: string;
  expectedActionVersion: number;
  anchorAt: string;
  anchorDate: string;
  reportTimezone: string;
  baselineStart: string;
  baselineEnd: string;
  cooldownEnd: string;
  measurementStart: string;
  measurementEnd: string;
  longMeasurementEnd: string | null;
  comparisonMode: MeasurementComparisonMode;
  metrics: MeasurementMetricWrite[];
  eventId: string;
  eventFactHash: string;
  actorType: ActionActorType;
  actorId: string;
  note: string | null;
};

export type RecordMeasurementObservationInput = {
  id: string;
  projectId: string;
  measurementPlanId: string;
  metricId: string;
  periodType: MeasurementPeriodType;
  factHash: string;
  effectiveStart: string;
  effectiveEnd: string;
  value: number;
  completeness: number;
  evidenceKind: MeasurementEvidenceKind;
  evidenceRef: string;
  capturedAt: string;
};

export type MeasurementObservationFact = {
  id: string;
  factHash: string;
};

export type FinalizeMeasurementGraphInput = {
  id: string;
  projectId: string;
  measurementPlanId: string;
  measurementPlanFactHash: string;
  actionId: string;
  expectedActionVersion: number;
  factHash: string;
  observationsHash: string;
  observations: MeasurementObservationFact[];
  outcome: MeasurementOutcome;
  confidence: number;
  summary: string;
  evaluatedAt: string;
  model: string | null;
  promptVersion: string | null;
  confoundingChangeEventIds: string[];
  eventId: string;
  eventFactHash: string;
  actorType: ActionActorType;
  actorId: string;
  note: string | null;
};
