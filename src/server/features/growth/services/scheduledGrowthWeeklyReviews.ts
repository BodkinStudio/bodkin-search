import { sha256Hex } from "@/server/lib/audit/ids";
import { GrowthSettingsRepository } from "../repositories/GrowthSettingsRepository";
import { GrowthRunsService } from "./GrowthRunsService";
import {
  advanceGrowthWeeklyReviewAt,
  growthWeeklyReviewCoordinate,
  initialGrowthWeeklyReviewAt,
} from "./GrowthWeeklySchedule";

const DUE_PROJECT_LIMIT = 50;
const TICK_DEADLINE_MS = 2 * 60_000;

async function workflowId(projectId: string, cadenceSlot: string) {
  const hash = await sha256Hex(JSON.stringify([projectId, cadenceSlot]));
  return `growth-weekly-${hash.slice(0, 40)}`;
}

export async function runScheduledGrowthWeeklyReviews(
  env: Env,
  now = new Date(),
) {
  if (Number.isNaN(now.valueOf()))
    throw new Error("Growth weekly scheduler clock is invalid");
  const nowIso = now.toISOString();
  const candidates = await GrowthSettingsRepository.listDueWeeklyReviews(
    nowIso,
    DUE_PROJECT_LIMIT + 1,
  );
  const due = candidates.slice(0, DUE_PROJECT_LIMIT);
  const deadline = Date.now() + TICK_DEADLINE_MS;
  let initialized = 0;
  let claimed = 0;
  let started = 0;
  let alreadyRecorded = 0;
  let concurrentChangeSkips = 0;
  let startErrors = 0;
  let projectErrors = 0;
  let stoppedByDeadline = false;

  for (const candidate of due) {
    if (Date.now() >= deadline) {
      stoppedByDeadline = true;
      break;
    }
    try {
      const observedAt =
        candidate.nextWeeklyReviewAt ??
        initialGrowthWeeklyReviewAt(
          now,
          candidate.reportTimezone,
          candidate.reportDay,
        );
      if (candidate.nextWeeklyReviewAt == null && observedAt > nowIso) {
        const saved = await GrowthSettingsRepository.claimWeeklyReviewSchedule({
          projectId: candidate.projectId,
          settingsRevision: candidate.settingsRevision,
          observedAt: null,
          nextAt: observedAt,
        });
        if (saved) initialized++;
        else concurrentChangeSkips++;
        continue;
      }

      const nextAt = advanceGrowthWeeklyReviewAt(
        observedAt,
        now,
        candidate.reportTimezone,
      );
      const coordinate = growthWeeklyReviewCoordinate(
        observedAt,
        candidate.reportTimezone,
      );
      const scheduleClaimed =
        await GrowthSettingsRepository.claimWeeklyReviewSchedule({
          projectId: candidate.projectId,
          settingsRevision: candidate.settingsRevision,
          observedAt: candidate.nextWeeklyReviewAt,
          nextAt,
        });
      if (!scheduleClaimed) {
        concurrentChangeSkips++;
        continue;
      }
      claimed++;

      const existing = await GrowthRunsService.getRunBySlot(
        candidate.projectId,
        "weekly_review",
        coordinate.cadenceSlot,
      );
      if (existing) {
        alreadyRecorded++;
        continue;
      }

      try {
        await env.GROWTH_WEEKLY_REVIEW_WORKFLOW.create({
          id: await workflowId(candidate.projectId, coordinate.cadenceSlot),
          params: {
            projectId: candidate.projectId,
            ...coordinate,
            reportTimezone: candidate.reportTimezone,
            scheduledAt: observedAt,
            settingsRevision: candidate.settingsRevision,
          },
        });
        started++;
      } catch (error) {
        startErrors++;
        const restored =
          await GrowthSettingsRepository.claimWeeklyReviewSchedule({
            projectId: candidate.projectId,
            settingsRevision: candidate.settingsRevision,
            observedAt: nextAt,
            nextAt: observedAt,
          });
        console.error(
          `[growth-weekly] Workflow start failed for project ${candidate.projectId}; schedule restored=${restored}`,
          error,
        );
      }
    } catch (error) {
      projectErrors++;
      console.error(
        `[growth-weekly] Scheduler failed for project ${candidate.projectId}`,
        error,
      );
    }
  }

  const overflow = candidates.length > DUE_PROJECT_LIMIT;
  const log = startErrors + projectErrors > 0 ? console.error : console.log;
  const summary = {
    event: "growth_weekly_scheduler_summary",
    candidates: candidates.length,
    limit: DUE_PROJECT_LIMIT,
    overflow,
    initialized,
    claimed,
    started,
    alreadyRecorded,
    concurrentChangeSkips,
    startErrors,
    projectErrors,
    stoppedByDeadline,
  };
  log(summary);
  return summary;
}
