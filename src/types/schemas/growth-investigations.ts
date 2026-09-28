import { z } from "zod";
import type { GrowthActionStatus } from "./growth-actions";
import { GROWTH_DISMISSAL_REASONS } from "./growth";

const id = z.string().trim().min(1).max(100);

const calendarDate = z
  .string()
  .trim()
  .min(1, "Choose a due date")
  .superRefine((value, context) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      context.addIssue({ code: "custom", message: "Use YYYY-MM-DD" });
      return;
    }
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

export const getGrowthInvestigationSchema = z.strictObject({
  projectId: id,
  signalId: id,
});
export const generateGrowthAiBriefSchema = z.strictObject({
  projectId: id,
  signalId: id,
});
export const approveGrowthInvestigationSchema = z.strictObject({
  projectId: id,
  signalId: id,
  dueOn: calendarDate,
});
const reviewBase = {
  projectId: id,
  signalId: id,
  expectedVersion: z.number().int().nonnegative(),
} as const;
export const reviewGrowthInvestigationSchema = z.discriminatedUnion(
  "decision",
  [
    z.strictObject({
      ...reviewBase,
      decision: z.literal("dismiss"),
      dismissalReason: z.enum(GROWTH_DISMISSAL_REASONS),
    }),
    z.strictObject({
      ...reviewBase,
      decision: z.literal("snooze"),
      snoozeUntil: calendarDate,
    }),
    z.strictObject({
      ...reviewBase,
      decision: z.literal("review_now"),
    }),
  ],
);
export const getGrowthWorkSchema = z.strictObject({ projectId: id });

const recommendationStatus = z.enum([
  "proposed",
  "accepted",
  "dismissed",
  "snoozed",
  "merged",
  "superseded",
]);
const canonicalTimestamp = z.string().datetime({ offset: true });
export const GROWTH_INVESTIGATION_SUPPRESSION_REASONS = [
  "existing_proposal",
  "existing_snooze",
  "prior_dismissal",
  "existing_action",
  "accepted_without_action",
  "resolved_recommendation",
] as const;
export type GrowthInvestigationSuppressionReason =
  (typeof GROWTH_INVESTIGATION_SUPPRESSION_REASONS)[number];

const growthInvestigationControllerViewSchema = z.strictObject({
  relationship: z.literal("controller"),
  recommendationId: id,
  title: z.string().min(1).max(300),
  rationale: z.string().min(1).max(5000),
  steps: z.array(z.string().min(1).max(2000)).min(1).max(100),
  displayUrls: z.array(z.string().url().max(2048).nullable()).max(100),
  status: recommendationStatus,
  reviewVersion: z.number().int().nonnegative(),
  dismissalReason: z.enum(GROWTH_DISMISSAL_REASONS).nullable(),
  snoozedUntil: canonicalTimestamp.nullable(),
  actionId: id.nullable(),
  dueOn: calendarDate.nullable(),
  templateVersion: z.string().min(1).max(100),
  evidenceSummary: z
    .discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("striking_distance_query"),
        query: z.string().min(1).max(500),
        page: z.string().url().max(2048),
        site: z.string().min(1).max(2000),
        baselinePeriod: z.strictObject({
          start: calendarDate,
          end: calendarDate,
        }),
        currentPeriod: z.strictObject({
          start: calendarDate,
          end: calendarDate,
        }),
        baseline: z.strictObject({
          position: z.number().finite(),
          impressions: z.number().finite(),
          clicks: z.number().finite(),
        }),
        current: z.strictObject({
          position: z.number().finite(),
          impressions: z.number().finite(),
          clicks: z.number().finite(),
        }),
      }),
      z.strictObject({
        kind: z.literal("high_impression_low_ctr_query"),
        query: z.string().min(1).max(500),
        page: z.string().url().max(2048),
        site: z.string().min(1).max(2000),
        baselinePeriod: z.strictObject({
          start: calendarDate,
          end: calendarDate,
        }),
        currentPeriod: z.strictObject({
          start: calendarDate,
          end: calendarDate,
        }),
        baseline: z.strictObject({
          position: z.number().finite(),
          impressions: z.number().finite(),
          clicks: z.number().finite(),
          ctr: z.number().finite(),
        }),
        current: z.strictObject({
          position: z.number().finite(),
          impressions: z.number().finite(),
          clicks: z.number().finite(),
          ctr: z.number().finite(),
        }),
      }),
      z.strictObject({
        kind: z.literal("persistent_tracked_rank_drop"),
        keyword: z.string().min(1).max(500),
        device: z.enum(["desktop", "mobile"]),
        page: z.string().url().max(2048),
        site: z.string().min(1).max(2000),
        serpDepth: z.number().int().min(1).max(1000),
        checks: z
          .array(
            z.strictObject({
              checkedAt: canonicalTimestamp,
              position: z.number().int().positive().nullable(),
            }),
          )
          .length(4),
      }),
      z.strictObject({
        kind: z.literal("new_critical_audit_issue"),
        issueType: z.string().min(1).max(100),
        title: z.string().min(1).max(300),
        page: z.string().url().max(2048),
        targetUrl: z.string().url().max(2048).nullable(),
        baselineAuditAt: canonicalTimestamp,
        currentAuditAt: canonicalTimestamp,
      }),
    ])
    .optional(),
});

const growthInvestigationSuppressedViewSchema = z.strictObject({
  relationship: z.literal("suppressed"),
  recommendationId: id,
  title: z.string().min(1).max(300),
  status: recommendationStatus,
  suppressionReason: z.enum(GROWTH_INVESTIGATION_SUPPRESSION_REASONS),
  policyVersion: z.string().min(1).max(100),
  actionId: id.nullable(),
  dueOn: calendarDate.nullable(),
});

export const growthInvestigationViewSchema = z
  .discriminatedUnion("relationship", [
    growthInvestigationControllerViewSchema,
    growthInvestigationSuppressedViewSchema,
  ])
  .superRefine((value, context) => {
    if (value.relationship !== "controller") return;
    if (value.status === "dismissed" && value.dismissalReason === null)
      context.addIssue({
        code: "custom",
        path: ["dismissalReason"],
        message: "Dismissed investigations require a dismissal reason",
      });
    if (value.status !== "dismissed" && value.dismissalReason !== null)
      context.addIssue({
        code: "custom",
        path: ["dismissalReason"],
        message: "Dismissal metadata only applies to dismissed investigations",
      });
    if (value.status === "snoozed" && value.snoozedUntil === null)
      context.addIssue({
        code: "custom",
        path: ["snoozedUntil"],
        message: "Snoozed investigations require a snooze timestamp",
      });
    if (value.status !== "snoozed" && value.snoozedUntil !== null)
      context.addIssue({
        code: "custom",
        path: ["snoozedUntil"],
        message: "Snooze metadata only applies to snoozed investigations",
      });
  });

export type GrowthInvestigationReviewInput = z.output<
  typeof reviewGrowthInvestigationSchema
>;
export type GrowthInvestigationView = z.output<
  typeof growthInvestigationViewSchema
>;

const growthAiBriefCitationSchema = z.strictObject({
  snapshot: z.string().max(4000).nullable(),
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(300),
  source: z.enum([
    "historical_saved_evidence",
    "current_project_context",
    "current_page_read",
  ]),
});
const growthAiBriefClaimSchema = z.strictObject({
  statement: z.string().min(1).max(1200),
  citationIds: z.array(z.string().min(1).max(100)).min(1).max(3),
});

export const growthAiBriefSchema = z.strictObject({
  kind: z.literal("growth_ai_brief"),
  persistence: z.literal("ephemeral"),
  generatedAt: canonicalTimestamp,
  affectedPageUrl: z.string().url().max(2048).nullable(),
  currentBusinessContext: z.enum(["available", "missing"]),
  currentPageRead: z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("read"),
      requestedUrl: z.string().url().max(2048),
      resolvedUrl: z.string().url().max(2048),
    }),
    z.strictObject({ status: z.literal("unavailable") }),
    z.strictObject({ status: z.literal("not_available") }),
  ]),
  businessRelevance: z.string().min(1).max(1800),
  observations: z.array(growthAiBriefClaimSchema).min(1).max(8),
  hypotheses: z
    .array(
      z.strictObject({
        statement: z.string().min(1).max(1200),
        confidence: z.enum(["low", "medium", "high"]),
        citationIds: z.array(z.string().min(1).max(100)).min(1).max(3),
      }),
    )
    .min(1)
    .max(5),
  proposedSteps: z.array(z.string().min(1).max(1200)).min(1).max(6),
  measurementApproach: z.string().min(1).max(1800),
  caveats: z.array(z.string().min(1).max(800)).min(1).max(6),
  citations: z.array(growthAiBriefCitationSchema).min(1).max(8),
});

export type GrowthAiBrief = z.output<typeof growthAiBriefSchema>;

export const saveGrowthAiBriefEditsSchema = z.strictObject({
  projectId: id,
  briefId: id,
  expectedVersion: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(300),
  proposedSteps: z.array(z.string().trim().min(1).max(1200)).min(1).max(6),
  measurementApproach: z.string().trim().min(1).max(1800),
});
export const approveGrowthAiBriefSchema = z.strictObject({
  projectId: id,
  briefId: id,
  expectedVersion: z.number().int().nonnegative(),
  dueOn: calendarDate,
});
export const savedGrowthAiBriefSchema = z.strictObject({
  id,
  projectId: id,
  signalId: id,
  recommendationId: id,
  templateVersion: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  promptVersion: z.string().min(1).max(100),
  generated: growthAiBriefSchema.omit({ persistence: true }),
  proposal: z.strictObject({
    title: z.string().trim().min(1).max(300),
    proposedSteps: z.array(z.string().trim().min(1).max(1200)).min(1).max(6),
    measurementApproach: z.string().trim().min(1).max(1800),
    version: z.number().int().nonnegative(),
  }),
  approval: z
    .strictObject({
      actionId: id,
      version: z.number().int().nonnegative(),
      dueOn: calendarDate,
      approvedAt: canonicalTimestamp,
      actorId: id,
    })
    .nullable(),
});
export type SavedGrowthAiBrief = z.output<typeof savedGrowthAiBriefSchema>;
export type SaveGrowthAiBriefEditsInput = z.output<
  typeof saveGrowthAiBriefEditsSchema
>;
export type ApproveGrowthAiBriefInput = z.output<
  typeof approveGrowthAiBriefSchema
>;

export type GrowthWorkItem = {
  id: string;
  aiBriefSignalId?: string;
  title: string;
  status: GrowthActionStatus;
  stateVersion: number;
  dueOn: string | null;
  createdAt: string;
  runId: string;
  displayUrls: (string | null)[];
};

export type GrowthWorkOverview = { actions: GrowthWorkItem[]; limit: number };
