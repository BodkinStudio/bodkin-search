import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestamp = z.string().datetime({ offset: true });

export const buildGrowthEvidencePacketSchema = z.strictObject({
  organizationId: id,
  projectId: id,
  signalId: id,
  assembledAt: timestamp,
  knownChangeEventIds: z.array(id).max(100).optional(),
});

export type BuildGrowthEvidencePacketInput = z.infer<
  typeof buildGrowthEvidencePacketSchema
>;

export const growthEvidencePacketSchema = z.strictObject({
  packetVersion: z.literal("growth-evidence-packet-v1"),
  packetReference: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  trust: z.strictObject({
    classification: z.literal("internal_review_only"),
    modelEgress: z.literal("not_enabled_in_this_slice"),
    narrative: z.literal("untrusted_user_authored_context"),
  }),
  assembledAt: timestamp,
  source: z.strictObject({
    organizationId: id,
    projectId: id,
    signalId: id,
    runId: id,
    evidenceReference: z.string().regex(/^gsc:[a-f0-9]{64}$/),
    detectorVersion: z.union([
      z.literal("priority-page-click-decline-v1"),
      z.literal("priority-page-click-decline-v2"),
    ]),
  }),
  observation: z.strictObject({
    capturedAt: timestamp,
    currentPeriod: z.strictObject({ startDate: date, endDate: date }),
    baselinePeriod: z.strictObject({
      startDate: date,
      endDate: date,
      derivation: z.literal("preceding_equal_length_v1"),
    }),
    baselineClicks: z.number().int().nonnegative().safe(),
    currentClicks: z.number().int().nonnegative().safe(),
    deltaClicks: z.number().int().safe(),
    deltaPercent: z.number().finite(),
  }),
  subject: z.strictObject({
    keyPageId: id,
    displayUrl: z.string().url().nullable(),
    displayUrlOmittedQueryOrFragment: z.boolean(),
    displayUrlWithheldCredentialMaterial: z.boolean(),
    role: z.enum(["hub", "spoke", "money", "other"]),
    commercialWeight: z.number().int().min(1).max(5).nullable(),
    protected: z.boolean(),
    activelyOptimized: z.boolean(),
    topic: z.string().nullable(),
    topicRedacted: z.boolean(),
    topicTruncated: z.boolean(),
    notes: z.string().nullable(),
    notesRedacted: z.boolean(),
    notesTruncated: z.boolean(),
    updatedAt: timestamp,
  }),
  currentCommercialContext: z.strictObject({
    projectName: z.string(),
    projectNameRedacted: z.boolean(),
    projectNameTruncated: z.boolean(),
    sections: z.array(
      z.strictObject({
        key: z.enum(["business_overview", "current_goal", "positioning"]),
        content: z.string().nullable(),
        updatedAt: timestamp.nullable(),
        redacted: z.boolean(),
        truncated: z.boolean(),
      }),
    ),
    currentNotHistorical: z.literal(true),
  }),
  selectedChangeEvents: z.strictObject({
    coverage: z.enum(["not_assessed", "caller_selected"]),
    selectedCount: z.number().int().min(0).max(10),
    includedCount: z.number().int().min(0).max(10),
    omittedIrrelevantCount: z.number().int().min(0).max(10),
    events: z.array(
      z.strictObject({
        id,
        changeType: z.string(),
        source: z.string(),
        happenedAt: timestamp,
        description: z.string(),
        descriptionRedacted: z.boolean(),
        descriptionTruncated: z.boolean(),
        match: z.literal("normalised_url_candidate"),
      }),
    ),
  }),
  limitations: z.array(z.string()).min(1),
});

export type GrowthEvidencePacket = z.infer<typeof growthEvidencePacketSchema>;
