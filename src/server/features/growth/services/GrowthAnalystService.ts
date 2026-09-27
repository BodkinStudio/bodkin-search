import { AppError } from "@/server/lib/errors";
import type { GROWTH_DISMISSAL_REASONS } from "@/types/schemas/growth";
import { GrowthAnalystRepository as repo } from "../repositories/GrowthAnalystRepository";
import { describeFinding, type SignalMetrics } from "./analystFinding";
import { GrowthInvestigationsService } from "./GrowthInvestigationsService";
import { GrowthOpportunitiesService } from "./GrowthOpportunitiesService";
import { GrowthPlanService } from "./GrowthPlanService";

const MAX_FINDINGS = 5;
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
  const [findings, measuring, lastWatchAt] = await Promise.all([
    readFindings(projectId),
    repo.activeMeasurements(projectId),
    repo.lastWatchAt(projectId),
  ]);
  return {
    lastWatchAt,
    findings: findings.slice(0, MAX_FINDINGS),
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

export const GrowthAnalystService = {
  getDigest,
  addFindingToPlan,
  closeFinding,
} as const;
