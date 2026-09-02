import { z } from "zod";
import { GROWTH_ACTION_STATUSES } from "./growth-actions";
import { GROWTH_EVIDENCE_KINDS } from "./growth";
import { PROJECT_CONTEXT_SECTION_KEYS } from "./projectContext";

const id = z.string().trim().min(1).max(100);
const timestamp = z.string().datetime({ offset: true });
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const currentActionStatus = z.enum([
  "approved",
  "ready",
  "in_progress",
  "blocked",
  "implemented",
  "measuring",
]);

const safeText = (max: number) =>
  z.strictObject({
    value: z.string().min(1).max(max),
    redacted: z.boolean(),
    truncated: z.boolean(),
  });

const safeUrl = z.strictObject({
  value: z.string().url().max(2048).nullable(),
  queryOrFragmentOmitted: z.boolean(),
  withheld: z.boolean(),
});

const contextSection = z.strictObject({
  key: z.enum(PROJECT_CONTEXT_SECTION_KEYS),
  content: safeText(800).nullable(),
  updatedAt: timestamp.nullable(),
});

const unresolvedRecommendation = z.strictObject({
  id,
  status: z.enum(["proposed", "snoozed", "accepted"]),
  title: safeText(300),
  rationale: safeText(400),
  category: safeText(100),
  impact: z.number().int().min(1).max(5),
  commercialRelevance: z.number().int().min(1).max(5),
  effort: z.number().int().min(1).max(5),
  urgency: z.number().int().min(1).max(3),
  confidence: z.number().finite().min(0).max(1),
  priorityScore: z.number().finite().nonnegative(),
  snoozedUntil: timestamp.nullable(),
  needsAction: z.boolean(),
  createdAt: timestamp,
});

const action = z.strictObject({
  id,
  title: safeText(300),
  category: safeText(100),
  priorityScore: z.number().finite().nonnegative(),
  status: currentActionStatus,
  version: z.number().int().nonnegative(),
  dueAt: timestamp,
  updatedAt: timestamp,
});

const signal = z.strictObject({
  id,
  signalType: safeText(100),
  entityType: safeText(100),
  metric: safeText(200),
  severity: z.enum(["info", "warning", "critical"]),
  confidence: z.number().finite().min(0).max(1),
  periodStart: calendarDate,
  periodEnd: calendarDate,
  baselineValue: z.number().finite(),
  currentValue: z.number().finite(),
  deltaValue: z.number().finite(),
  deltaPercent: z.number().finite().nullable(),
  evidenceKind: z.enum(GROWTH_EVIDENCE_KINDS),
  runStatus: z.enum(["completed", "completed_with_errors"]),
  capturedAt: timestamp,
});

const dueMeasurement = z.strictObject({
  id,
  actionId: id,
  actionTitle: safeText(300).nullable(),
  availableOn: calendarDate,
  reportTimezone: z.string().min(1).max(100),
  actionStatus: z.enum(GROWTH_ACTION_STATUSES).nullable(),
  integrity: z.enum([
    "consistent",
    "action_missing",
    "action_state_mismatch",
    "action_version_mismatch",
  ]),
});

/** Bounded current view of Measurement Plans whose frozen windows have elapsed. */
export const growthDueMeasurementsDtoSchema = z.discriminatedUnion(
  "scanState",
  [
    z.strictObject({
      scanState: z.literal("complete"),
      items: z.array(dueMeasurement).max(5),
      hasMore: z.boolean(),
    }),
    z.strictObject({
      scanState: z.literal("overflow"),
      items: z.array(dueMeasurement).length(0),
      hasMore: z.literal(true),
    }),
  ],
);

const collection = <T extends z.ZodType>(item: T) =>
  z.strictObject({ items: z.array(item).max(5), hasMore: z.boolean() });

/** Compact, saved-records-only Growth state intended for an agent's first read. */
export const growthProjectSummaryDtoSchema = z.strictObject({
  asOf: timestamp,
  consistency: z.literal("current_not_snapshot"),
  project: z.strictObject({
    id,
    name: safeText(120),
    url: safeUrl.nullable(),
    market: z.strictObject({
      locationCode: z.number().int().nullable(),
      languageCode: z.string().min(1).max(20).nullable(),
    }),
    createdAt: timestamp,
  }),
  settings: z.strictObject({
    growthEnabled: z.boolean(),
    reportTimezone: z.string().min(1).max(100),
    reportCadence: z.enum(["weekly", "monthly"]),
    reportDay: z.number().int().min(1).max(28),
    defaultBaselineDays: z.number().int().min(1).max(365),
    defaultCooldownDays: z.number().int().min(0).max(365),
    defaultPrimaryWindowDays: z.number().int().min(1).max(365),
    defaultLongWindowDays: z.number().int().min(1).max(365).nullable(),
    persisted: z.boolean(),
    updatedAt: timestamp.nullable(),
  }),
  context: z.strictObject({
    scope: z.literal("typed_sections_with_other_context_counts_only"),
    sections: z
      .array(contextSection)
      .length(PROJECT_CONTEXT_SECTION_KEYS.length),
    missingSections: z
      .array(z.enum(PROJECT_CONTEXT_SECTION_KEYS))
      .max(PROJECT_CONTEXT_SECTION_KEYS.length),
    typedSectionPresence: z.enum(["none", "some", "all"]),
    customSectionCount: z.number().int().nonnegative(),
    competitorCount: z.number().int().nonnegative(),
    keyPageCount: z.number().int().nonnegative(),
    researchLog: z.strictObject({
      retainedCount: z.number().int().nonnegative(),
      retentionLimited: z.boolean(),
    }),
  }),
  freshness: z.strictObject({
    scope: z.literal("saved_growth_signals"),
    latestSignalAt: timestamp.nullable(),
    byKind: z
      .array(
        z.strictObject({
          evidenceKind: z.enum(GROWTH_EVIDENCE_KINDS),
          capturedAt: timestamp,
        }),
      )
      .max(GROWTH_EVIDENCE_KINDS.length),
  }),
  latestRun: z
    .strictObject({
      id,
      runType: z.enum([
        "daily_monitor",
        "weekly_review",
        "monthly_review",
        "measurement_review",
        "manual_analysis",
      ]),
      trigger: z.enum(["manual", "scheduled"]),
      status: z.enum([
        "running",
        "completed",
        "completed_with_errors",
        "failed",
      ]),
      periodStart: calendarDate,
      periodEnd: calendarDate,
      startedAt: timestamp,
      completedAt: timestamp.nullable(),
    })
    .nullable(),
  unresolvedRecommendations: collection(unresolvedRecommendation),
  currentActions: collection(action),
  recentSignals: collection(signal),
  dueMeasurements: growthDueMeasurementsDtoSchema,
});

export type GrowthProjectSummaryDto = z.output<
  typeof growthProjectSummaryDtoSchema
>;
export type GrowthDueMeasurementsDto = z.output<
  typeof growthDueMeasurementsDtoSchema
>;
