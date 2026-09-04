import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { GrowthInsightsRepository } from "@/server/features/growth/repositories/GrowthInsightsRepository";
import { GrowthRunsRepository } from "@/server/features/growth/repositories/GrowthRunsRepository";
import { AppError } from "@/server/lib/errors";
import { NEW_CRITICAL_AUDIT_ISSUE_INVESTIGATION_TEMPLATE_VERSION } from "./GrowthInvestigationTemplate";
import { GrowthOpportunityDecisionsService } from "./GrowthOpportunityDecisionsService";
import { GrowthRunsService } from "./GrowthRunsService";
import {
  detectNewCriticalAuditIssues,
  findComparableAuditPair,
  NEW_CRITICAL_AUDIT_ISSUE_DETECTOR_VERSION,
} from "./NewCriticalAuditIssueDetector";

const RUN_TYPE = "manual_analysis" as const;
const PREFIX = "critical-audit-issue-check:";
type Run = Awaited<ReturnType<typeof GrowthRunsService.getRun>>;
type Decision = Awaited<
  ReturnType<
    typeof GrowthOpportunityDecisionsService.recordCriticalAuditIssueInvestigation
  >
>;

const summary = (run: Run) => ({
  id: run.id,
  status: run.status,
  periodStart: run.periodStart,
  periodEnd: run.periodEnd,
  startedAt: run.startedAt,
  completedAt: run.completedAt,
  failureCode: run.failureCode,
  failureMessage: run.failureMessage,
});
const isRun = (run: Run) =>
  run.runType === RUN_TYPE &&
  run.detectorVersion === NEW_CRITICAL_AUDIT_ISSUE_DETECTOR_VERSION &&
  run.cadenceSlot.startsWith(PREFIX);

function counts(decisions: Array<Decision | null>) {
  return decisions.reduce(
    (value, decision) => ({
      savedOpportunityCount:
        value.savedOpportunityCount +
        (decision?.relationship === "controller" ? 1 : 0),
      alreadyCoveredCount:
        value.alreadyCoveredCount +
        (decision?.relationship === "suppressed" ? 1 : 0),
    }),
    { savedOpportunityCount: 0, alreadyCoveredCount: 0 },
  );
}

async function saved(run: Run, replayed: boolean) {
  const signals = await GrowthRunsService.listSignals(run.projectId, run.id);
  const controllers = signals.filter(
    (signal) =>
      signal.signalType === "new_critical_audit_issue" &&
      signal.entityType === "audit_issue" &&
      signal.metric === "critical_audit_issue_presence" &&
      signal.evidenceKind === "audit_result",
  );
  const decisions = await Promise.all(
    controllers.map((signal) =>
      GrowthOpportunityDecisionsService.getDecision(
        run.projectId,
        run.id,
        signal.id,
      ),
    ),
  );
  return {
    run: summary(run),
    replayed,
    candidateCount: controllers.length,
    ...counts(decisions),
  };
}

function periodDate(value: string | undefined) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.valueOf())
    ? null
    : parsed.toISOString().slice(0, 10);
}

function completedAuditFacts(
  audits: Awaited<ReturnType<typeof AuditRepository.getAuditsByProject>>,
) {
  return audits
    .filter((audit) => audit.status === "completed")
    .map((audit) => ({
      id: audit.id,
      projectId: audit.projectId,
      startUrl: audit.startUrl,
      status: audit.status,
      config: audit.config,
      startedAt: audit.startedAt,
    }));
}

function issueFacts(
  issues: Awaited<ReturnType<typeof AuditRepository.getIssuesForAudit>>,
) {
  return issues.map((issue) => {
    if (issue.severity !== "critical")
      throw new AppError("VALIDATION_ERROR", "Audit issue is not critical");
    return {
      id: issue.id,
      auditId: issue.auditId,
      pageUrl: issue.pageUrl,
      issueType: issue.issueType,
      severity: issue.severity,
      detailsJson: issue.detailsJson,
    };
  });
}

async function runCheck(input: { projectId: string; requestKey: string }) {
  const cadenceSlot = `${PREFIX}${input.requestKey}`;
  const existing = await GrowthRunsRepository.getRunBySlot(
    input.projectId,
    RUN_TYPE,
    cadenceSlot,
  );
  if (existing) {
    if (!isRun(existing))
      throw new AppError("CONFLICT", "Audit-issue request slot is occupied");
    return saved(existing, true);
  }
  const [site, audits] = await Promise.all([
    GrowthInsightsRepository.projectDomain(input.projectId),
    AuditRepository.getAuditsByProject(input.projectId),
  ]);
  if (!site) throw new AppError("NOT_FOUND", "Growth project not found");
  let pair: ReturnType<typeof findComparableAuditPair> = {
    current: null,
    baseline: null,
  };
  let invalidScope = false;
  try {
    pair = findComparableAuditPair(completedAuditFacts(audits));
  } catch {
    invalidScope = true;
  }
  const today = new Date().toISOString().slice(0, 10);
  const claim = await GrowthRunsService.claimManualRun({
    projectId: input.projectId,
    runType: RUN_TYPE,
    cadenceSlot,
    periodStart: periodDate(pair.baseline?.startedAt) ?? today,
    periodEnd: periodDate(pair.current?.startedAt) ?? today,
    detectorVersion: NEW_CRITICAL_AUDIT_ISSUE_DETECTOR_VERSION,
  });
  if (!isRun(claim.run))
    throw new AppError("CONFLICT", "Audit-issue request slot is occupied");
  if (!claim.claimed) return saved(claim.run, true);
  if (invalidScope) {
    const terminal = await GrowthRunsService.completeRunWithErrors({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "INVALID_AUDIT_SCOPE",
      failureMessage:
        "The latest completed audit has invalid saved scope, so no comparison was made.",
    });
    return {
      run: summary(terminal),
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    };
  }
  if (!pair.current || !pair.baseline) {
    const terminal = await GrowthRunsService.completeRunWithErrors({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "INSUFFICIENT_COMPARABLE_AUDITS",
      failureMessage:
        "Two completed audits with the same crawl start and page limit are needed before new critical issues can be detected.",
    });
    return {
      run: summary(terminal),
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    };
  }
  const [baselineIssues, currentIssues] = await Promise.all([
    AuditRepository.getIssuesForAudit(pair.baseline.id, {
      severity: "critical",
    }),
    AuditRepository.getIssuesForAudit(pair.current.id, {
      severity: "critical",
    }),
  ]);
  let candidates: ReturnType<typeof detectNewCriticalAuditIssues>;
  try {
    candidates = detectNewCriticalAuditIssues({
      projectId: input.projectId,
      runId: claim.run.id,
      capturedAt: new Date().toISOString(),
      baselineAudit: pair.baseline,
      currentAudit: pair.current,
      baselineIssues: issueFacts(baselineIssues),
      currentIssues: issueFacts(currentIssues),
    });
  } catch {
    const terminal = await GrowthRunsService.failRun({
      projectId: input.projectId,
      runId: claim.run.id,
      failureCode: "AUDIT_EVIDENCE_INVALID",
      failureMessage:
        "Saved audit issue evidence could not be validated. No investigation was saved.",
    });
    return {
      run: summary(terminal),
      replayed: false,
      candidateCount: 0,
      savedOpportunityCount: 0,
      alreadyCoveredCount: 0,
    };
  }
  const decisions: Decision[] = [];
  const signalIds: string[] = [];
  try {
    for (const candidate of candidates) {
      const signal = await GrowthRunsService.recordSignal(candidate.signal);
      signalIds.push(signal.id);
      const { signal: _signal, status: _status, ...facts } = candidate;
      decisions.push(
        await GrowthOpportunityDecisionsService.recordCriticalAuditIssueInvestigation(
          {
            projectId: input.projectId,
            runId: claim.run.id,
            signal,
            candidate: facts,
          },
        ),
      );
    }
    if (candidates.length)
      await GrowthRunsService.setAnalysisVersion({
        projectId: input.projectId,
        runId: claim.run.id,
        analysisVersion:
          NEW_CRITICAL_AUDIT_ISSUE_INVESTIGATION_TEMPLATE_VERSION,
      });
    const terminal = await GrowthRunsService.completeRun({
      projectId: input.projectId,
      runId: claim.run.id,
    });
    return {
      run: summary(terminal),
      replayed: false,
      candidateCount: candidates.length,
      ...counts(decisions),
    };
  } catch {
    const durable = (
      await Promise.all(
        signalIds.map((signalId) =>
          GrowthOpportunityDecisionsService.getDecision(
            input.projectId,
            claim.run.id,
            signalId,
          ),
        ),
      )
    ).filter((decision): decision is NonNullable<typeof decision> =>
      Boolean(decision),
    );
    if (durable.length)
      await GrowthRunsService.setAnalysisVersion({
        projectId: input.projectId,
        runId: claim.run.id,
        analysisVersion:
          NEW_CRITICAL_AUDIT_ISSUE_INVESTIGATION_TEMPLATE_VERSION,
      });
    const terminal = durable.length
      ? await GrowthRunsService.completeRunWithErrors({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "INVESTIGATION_GENERATION_FAILED",
          failureMessage:
            "Some audit-issue investigations could not be saved; completed decisions remain available.",
        })
      : await GrowthRunsService.failRun({
          projectId: input.projectId,
          runId: claim.run.id,
          failureCode: "INVESTIGATION_GENERATION_FAILED",
          failureMessage:
            "Audit-issue facts were saved, but no investigation could be completed.",
        });
    return {
      run: summary(terminal),
      replayed: false,
      candidateCount: candidates.length,
      ...counts(durable),
    };
  }
}

export const GrowthCriticalAuditIssueCheckService = { runCheck } as const;
