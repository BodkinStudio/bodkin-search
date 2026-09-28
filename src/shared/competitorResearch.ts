import { z } from "zod";
import { domainField } from "@/types/schemas/domain";

export const competitorResearchRequestSchema = z.object({
  projectId: z.string().uuid(),
  competitorDomain: domainField,
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
  topic: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
});

const competitorResearchRowSchema = z.object({
  keyword: z.string(),
  competitorPosition: z.number().int().positive().nullable(),
  projectPosition: z.number().int().positive().nullable(),
  competitorUrl: z.string().nullable(),
  projectUrl: z.string().nullable(),
  searchVolume: z.number().nonnegative().nullable(),
  cpc: z.number().nonnegative().nullable(),
  keywordDifficulty: z.number().nonnegative().nullable(),
});

export const competitorResearchResultSchema = z.object({
  projectDomain: z.string(),
  competitorDomain: z.string(),
  topic: z.string().nullable(),
  locationCode: z.number().int().positive(),
  languageCode: z.string(),
  fetchedAt: z.string(),
  rows: z.array(competitorResearchRowSchema),
  warnings: z.array(z.string()),
  billing: z.object({
    /** This request makes no more than these metered provider calls on a miss. */
    providerCallsMaximum: z.literal(2),
    estimateUsd: z.number().nullable(),
    estimateKnown: z.boolean(),
  }),
});

export type CompetitorResearchRequest = z.infer<
  typeof competitorResearchRequestSchema
>;
export type CompetitorResearchResult = z.infer<
  typeof competitorResearchResultSchema
>;
