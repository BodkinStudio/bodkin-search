import { GrowthWatchRepository } from "../repositories/GrowthWatchRepository";
import { GrowthCriticalAuditIssueCheckService } from "./GrowthCriticalAuditIssueCheckService";
import { GrowthLowCtrCheckService } from "./GrowthLowCtrCheckService";
import { GrowthMeasurementDueCheckService } from "./GrowthMeasurementDueCheckService";
import { GrowthPageMonitorService } from "./GrowthPageMonitorService";
import { GrowthPlanMeasurementService } from "./GrowthPlanMeasurementService";
import { GrowthPersistentRankDropCheckService } from "./GrowthPersistentRankDropCheckService";
import { GrowthStrikingDistanceCheckService } from "./GrowthStrikingDistanceCheckService";

// Projects per hourly tick; anything left over is picked up next hour.
const BATCH = 10;

/** ISO week key, e.g. "2026-W39": one watch per project per week. */
export function isoWeekKey(now: Date) {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.valueOf() - yearStart.valueOf()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const watchRequestKey = (now: Date) => `watch-${isoWeekKey(now)}`;

// The checks the watch runs. Each is idempotent per request key, so a
// project is really checked once a week however often it is visited, and a
// check that cannot run (no rank tracking, no comparable audits, Search
// Console not connected) fails alone without stopping the others.
const CHECKS = [
  ["striking_distance", GrowthStrikingDistanceCheckService.runCheck],
  ["low_ctr", GrowthLowCtrCheckService.runCheck],
  ["rank_drop", GrowthPersistentRankDropCheckService.runCheck],
  ["critical_audit_issue", GrowthCriticalAuditIssueCheckService.runCheck],
  ["measurement_due", GrowthMeasurementDueCheckService.runCheck],
  ["page_changes", GrowthPageMonitorService.checkPages],
  ["collect_measurements", GrowthPlanMeasurementService.collectDue],
] as const;

async function watchProject(projectId: string, now: Date) {
  const requestKey = watchRequestKey(now);
  const results: Record<string, "ok" | "failed"> = {};
  for (const [name, run] of CHECKS) {
    try {
      await run({ projectId, requestKey });
      results[name] = "ok";
    } catch (error) {
      results[name] = "failed";
      console.warn(`[growth-watch] ${name} failed for ${projectId}`, error);
    }
  }
  return results;
}

// Called from the hourly cron: watch the next few projects that have not
// been watched this week.
async function runWatchTick(now = new Date()) {
  const due = await GrowthWatchRepository.listUnwatchedProjectIds(
    watchRequestKey(now),
    BATCH,
  );
  for (const projectId of due) await watchProject(projectId, now);
  return { visited: due.length };
}

export const GrowthWatchService = { runWatchTick, watchProject } as const;
