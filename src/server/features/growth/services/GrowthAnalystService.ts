import { AppError } from "@/server/lib/errors";
import type { GROWTH_DISMISSAL_REASONS } from "@/types/schemas/growth";
import { GrowthAnalystRepository as repo } from "../repositories/GrowthAnalystRepository";
import { describeFinding, type SignalMetrics } from "./analystFinding";
import { generateGrowthAiBrief } from "./GrowthAiBriefService";
import { GrowthInvestigationsService } from "./GrowthInvestigationsService";
import { GrowthOpportunitiesService } from "./GrowthOpportunitiesService";
import { GrowthPlanService } from "./GrowthPlanService";

const MAX_FINDINGS = 5;
// Findings the watch drafts an AI brief for each week, biggest first. Briefs
// exist only for search findings that point at one page.
const AUTO_BRIEFS = 2;
// These apply to every finding, so there is no point trying the next one.
const STOP_CODES = new Set(["INSUFFICIENT_CREDITS", "AUTH_CONFIG_MISSING"]);
const BRIEFABLE = new Set([
  "striking_distance_query",
  "priority_page_click_decline",
]);
// Search Console needs a few days after a window closes before its numbers
// are complete, so a result is expected a little after the window ends.
const RESULT_LAG_DAYS = 3;

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

const SOURCE_LABELS: Record<string, string> = {
  tracked_rank_drop: "Tracked rankings",
  new_critical_audit_issue: "Site audit",
};

// Every open finding from the Growth checks, as an analyst's note with its
// numbers, biggest first.
async function readFindings(projectId: string) {
  const opportunities =
    await GrowthOpportunitiesService.listOpportunities(projectId);
  const sources = opportunities.recommendations.flatMap((entry) =>
    entry.reviewSource ? [entry.reviewSource.signalId] : [],
  );
  const { heads, rows } = await repo.signalFamilies(projectId, sources);
  return heads
    .map((head) => {
      const metrics: SignalMetrics = {};
      for (const row of rows)
        if (
          row.runId === head.runId &&
          row.signalType === head.signalType &&
          row.entityRef === head.entityRef
        )
          metrics[row.metric] = { before: row.before, after: row.after };
      return {
        signalId: head.id,
        kind: head.signalType,
        observedOn: head.periodEnd,
        sourceLabel: SOURCE_LABELS[head.signalType] ?? "Google Search Console",
        ...describeFinding(head.signalType, head.entityRef, metrics),
      };
    })
    .toSorted((a, b) => b.weight - a.weight);
}

// The "This week" read of a project: the few findings most worth acting on,
// which shipped work is being measured, and when the watch last ran.
async function getDigest(projectId: string) {
  const [findings, measuring, lastWatchAt, settings] = await Promise.all([
    readFindings(projectId),
    repo.activeMeasurements(projectId),
    repo.lastWatchAt(projectId),
    repo.autoBriefSettings(projectId),
  ]);
  const top = findings.slice(0, MAX_FINDINGS);
  const briefed = await repo.briefedSignalIds(
    projectId,
    top.map((finding) => finding.signalId),
  );
  return {
    lastWatchAt,
    autoBriefs: settings?.enabled ?? false,
    findings: top.map((finding) => ({
      ...finding,
      hasBrief: briefed.has(finding.signalId),
    })),
    findingsTotal: findings.length,
    measuring: measuring.map((plan) => ({
      actionId: plan.actionId,
      title: plan.title,
      shippedOn: plan.anchorDate,
      resultsFrom: addDays(plan.measurementEnd, RESULT_LAG_DAYS),
    })),
  };
}

async function closeFinding(
  projectId: string,
  signalId: string,
  dismissalReason: (typeof GROWTH_DISMISSAL_REASONS)[number],
) {
  const investigation = await GrowthInvestigationsService.getInvestigation(
    projectId,
    signalId,
  );
  if (investigation?.relationship !== "controller")
    throw new AppError("NOT_FOUND", "This finding is no longer open");
  await GrowthInvestigationsService.reviewInvestigation({
    projectId,
    signalId,
    expectedVersion: investigation.reviewVersion,
    decision: "dismiss",
    dismissalReason,
  });
}

// A finding becomes a plan action carrying its numbers as evidence; the
// finding is then closed as planned so it stops being suggested.
async function addFindingToPlan(input: {
  projectId: string;
  signalId: string;
  workstreamId: string;
  dueOn: string;
  actorId: string;
}) {
  const finding = (await readFindings(input.projectId)).find(
    (entry) => entry.signalId === input.signalId,
  );
  if (!finding)
    throw new AppError("NOT_FOUND", "This finding is no longer open");
  const action = await GrowthPlanService.createPlanAction({
    projectId: input.projectId,
    requestKey: `analyst:${input.signalId}`,
    workstreamId: input.workstreamId,
    title: finding.title.slice(0, 200),
    rationale: `${finding.headline} ${finding.suggestion}`.slice(0, 2000),
    dueOn: input.dueOn,
    category: "plan",
    priorityScore: 0,
    targets: finding.target
      ? [{ targetType: finding.target.type, targetValue: finding.target.value }]
      : [],
    evidence: [
      {
        kind: "measured",
        statement: finding.headline.slice(0, 1000),
        sourceLabel: finding.sourceLabel,
        observedOn: finding.observedOn,
      },
    ],
    actorType: "user",
    actorId: input.actorId,
  });
  await closeFinding(input.projectId, input.signalId, "already_planned");
  return action;
}

// Run by the weekly watch after the checks: drafts AI briefs for the biggest
// findings so the reasoning is ready when someone looks. A saved brief is
// reused, so a finding is only paid for once. Out of credits or no AI
// provider stops the run quietly; the findings are still listed.
async function briefTopFindings(input: { projectId: string }) {
  const settings = await repo.autoBriefSettings(input.projectId);
  if (!settings?.enabled) return { briefed: 0 };
  const candidates = (await readFindings(input.projectId))
    .filter((finding) => BRIEFABLE.has(finding.kind))
    .slice(0, AUTO_BRIEFS);
  let briefed = 0;
  for (const finding of candidates) {
    try {
      await generateGrowthAiBrief({
        organizationId: settings.organizationId,
        projectId: input.projectId,
        signalId: finding.signalId,
        userId: "system",
        userEmail: "system@openseo.so",
      });
      briefed++;
    } catch (error) {
      console.warn(
        `[growth-watch] brief skipped for ${finding.signalId}`,
        error instanceof Error ? error.message : error,
      );
      if (error instanceof AppError && STOP_CODES.has(error.code)) break;
    }
  }
  return { briefed };
}

export const GrowthAnalystService = {
  getDigest,
  briefTopFindings,
  setAutoBriefs: repo.setAutoBriefs,
  addFindingToPlan,
  closeFinding,
} as const;
