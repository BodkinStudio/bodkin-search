import { z } from "zod";

const id = z.string().trim().min(1).max(100);

export const getGrowthChecksOverviewSchema = z.strictObject({ projectId: id });
export const runGrowthCheckSchema = z.strictObject({
  projectId: id,
  requestKey: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9_-]+$/),
});
export const getGrowthCheckRunSchema = z.strictObject({
  projectId: id,
  runId: id,
});
export const getGrowthCheckEvidenceSchema = z.strictObject({
  projectId: id,
  signalId: id,
});

export type GrowthCheckOverview = {
  setup: "ready" | "missing_connection" | "missing_key_pages";
  keyPageCount: number;
  runs: Array<{
    id: string;
    status: "running" | "completed" | "completed_with_errors" | "failed";
    periodStart: string;
    periodEnd: string;
    startedAt: string;
    completedAt: string | null;
    failureCode: string | null;
    failureMessage: string | null;
  }>;
};
