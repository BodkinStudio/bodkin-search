import { z } from "zod";
import type { GrowthActionStatus } from "./growth-actions";

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
export const approveGrowthInvestigationSchema = z.strictObject({
  projectId: id,
  signalId: id,
  dueOn: calendarDate,
});
export const getGrowthWorkSchema = z.strictObject({ projectId: id });

type GrowthRecommendationStatus =
  | "proposed"
  | "accepted"
  | "dismissed"
  | "snoozed"
  | "merged"
  | "superseded";

export type GrowthInvestigationView = {
  recommendationId: string;
  title: string;
  rationale: string;
  steps: string[];
  displayUrls: (string | null)[];
  status: GrowthRecommendationStatus;
  actionId: string | null;
  dueOn: string | null;
  templateVersion: string;
};

export type GrowthWorkItem = {
  id: string;
  title: string;
  status: GrowthActionStatus;
  stateVersion: number;
  dueOn: string | null;
  createdAt: string;
  runId: string;
  displayUrls: (string | null)[];
};

export type GrowthWorkOverview = { actions: GrowthWorkItem[]; limit: number };
