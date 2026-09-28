import { normalizeKeyPageUrl } from "@/server/features/project-context/services/contextUpdateOps";
import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type { RecordGrowthSignalInput } from "@/types/schemas/growth";
import { GrowthInsightsRepository } from "../repositories/GrowthInsightsRepository";
import { GrowthOpportunityDecisionsRepository } from "../repositories/GrowthOpportunityDecisionsRepository";
import { newCriticalAuditIssueInvestigationTemplate } from "./GrowthInvestigationTemplate";
import { newCriticalAuditIssueInvestigationDescriptor } from "./GrowthInvestigationTemplateDescriptor";
import { normalizeGrowthTargets } from "./GrowthTargetNormalizer";
import {
  areAuditsComparable,
  canonicalAuditInstant,
  criticalAuditIssueIdentity,
  parseNewCriticalAuditIssueEvidenceRef,
  type NewCriticalAuditIssueCandidate,
} from "./NewCriticalAuditIssueDetector";
import {
  NEW_CRITICAL_AUDIT_ISSUE_OPPORTUNITY_POLICY_VERSION,
  newCriticalAuditIssueOpportunityDedupeKey,
} from "./NewCriticalAuditIssueOpportunityPolicy";

type SavedSignal = RecordGrowthSignalInput & { id: string };

async function deterministicId(input: {
  projectId: string;
  dedupeKey: string;
  kind: "insight" | "recommendation";
}) {
  return (
    await sha256Hex(
      `${input.projectId}|${input.dedupeKey}|initial-controller|${input.kind}`,
    )
  ).slice(0, 36);
}

export async function recordCriticalAuditIssueInvestigation(input: {
  projectId: string;
  runId: string;
  signal: SavedSignal;
  candidate: Omit<NewCriticalAuditIssueCandidate, "signal" | "status">;
}) {
  const evidence = parseNewCriticalAuditIssueEvidenceRef(
    input.signal.evidenceRef,
  );
  const identity = criticalAuditIssueIdentity(input.candidate.issue);
  const baselineAt = canonicalAuditInstant(
    input.candidate.baselineAudit.startedAt,
    "Baseline audit timestamp",
  );
  const currentAt = canonicalAuditInstant(
    input.candidate.currentAudit.startedAt,
    "Current audit timestamp",
  );
  if (
    input.signal.projectId !== input.projectId ||
    input.signal.runId !== input.runId ||
    input.signal.signalType !==
      newCriticalAuditIssueInvestigationDescriptor.controller.signalType ||
    input.signal.entityType !==
      newCriticalAuditIssueInvestigationDescriptor.controller.entityType ||
    input.signal.entityRef !== input.candidate.issue.id ||
    input.signal.metric !==
      newCriticalAuditIssueInvestigationDescriptor.controller.metric ||
    input.signal.evidenceKind !==
      newCriticalAuditIssueInvestigationDescriptor.controller.evidenceKind ||
    input.signal.severity !== "critical" ||
    input.signal.baselineValue !== 0 ||
    input.signal.currentValue !== 1 ||
    input.signal.deltaValue !== 1 ||
    input.signal.periodStart !== baselineAt.slice(0, 10) ||
    input.signal.periodEnd !== currentAt.slice(0, 10) ||
    !evidence ||
    evidence.baselineAuditId !== input.candidate.baselineAudit.id ||
    evidence.currentAuditId !== input.candidate.currentAudit.id ||
    evidence.issueId !== input.candidate.issue.id ||
    input.candidate.issue.auditId !== input.candidate.currentAudit.id ||
    input.candidate.baselineAudit.projectId !== input.projectId ||
    input.candidate.currentAudit.projectId !== input.projectId ||
    input.candidate.baselineAudit.status !== "completed" ||
    input.candidate.currentAudit.status !== "completed" ||
    !areAuditsComparable(
      input.candidate.baselineAudit,
      input.candidate.currentAudit,
    ) ||
    baselineAt >= currentAt ||
    identity.stableKey !== input.candidate.stableKey ||
    identity.issueType !== input.candidate.issueType ||
    identity.title !== input.candidate.title ||
    identity.explanation !== input.candidate.explanation ||
    identity.howToFix !== input.candidate.howToFix ||
    identity.pageUrl !== input.candidate.pageUrl ||
    identity.targetUrl !== input.candidate.targetUrl
  )
    throw new AppError("VALIDATION_ERROR", "Growth Signal is not eligible");

  const existing = await GrowthOpportunityDecisionsRepository.getSignalDecision(
    input.projectId,
    input.runId,
    input.signal.id,
  );
  if (existing) return existing;
  const domain = await GrowthInsightsRepository.projectDomain(input.projectId);
  if (!domain) throw new AppError("NOT_FOUND", "Growth project not found");
  const page = normalizeKeyPageUrl(identity.pageUrl);
  const template = newCriticalAuditIssueInvestigationTemplate({
    projectId: input.projectId,
    runId: input.runId,
    signal: input.signal,
    issueTitle: identity.title,
    issueExplanation: identity.explanation,
    howToFix: identity.howToFix,
    page,
    site: domain,
    targetUrl: identity.targetUrl,
  });
  const targets = normalizeGrowthTargets(
    domain,
    template.recommendation.targets,
    "key_page_identity",
  );
  if (
    targets.length !== 2 ||
    !targets.some((target) => target.targetType === "url") ||
    !targets.some((target) => target.targetType === "site")
  )
    throw new AppError("VALIDATION_ERROR", "Growth targets are not eligible");
  const dedupeKey = await newCriticalAuditIssueOpportunityDedupeKey({
    projectId: input.projectId,
    stableIssueKey: identity.stableKey,
  });
  const insightFact = {
    projectId: input.projectId,
    runId: input.runId,
    creationKey: template.insight.creationKey,
    title: template.insight.title,
    explanation: template.insight.explanation,
    hypothesis: template.insight.hypothesis,
    confidence: template.insight.confidence,
    model: null,
    promptVersion: null,
    signalIds: [input.signal.id],
  };
  const insightId = await deterministicId({
    projectId: input.projectId,
    dedupeKey,
    kind: "insight",
  });
  const recommendationFact = {
    projectId: input.projectId,
    runId: input.runId,
    creationKey: template.recommendation.creationKey,
    title: template.recommendation.title,
    rationale: template.recommendation.rationale,
    category: template.recommendation.category,
    impact: template.recommendation.impact,
    commercialRelevance: template.recommendation.commercialRelevance,
    effort: template.recommendation.effort,
    urgency: template.recommendation.urgency,
    confidence: template.recommendation.confidence,
    priorityScore: template.recommendation.priorityScore,
    model: null,
    promptVersion: null,
    insightIds: [insightId],
    targets,
    steps: template.recommendation.steps.map((content, position) => ({
      position,
      content: content.trim().replace(/\s+/g, " "),
    })),
  };
  const recommendationId = await deterministicId({
    projectId: input.projectId,
    dedupeKey,
    kind: "recommendation",
  });
  await GrowthOpportunityDecisionsRepository.writeDecision({
    projectId: input.projectId,
    signalRunId: input.runId,
    signalId: input.signal.id,
    dedupeKey,
    policyVersion: NEW_CRITICAL_AUDIT_ISSUE_OPPORTUNITY_POLICY_VERSION,
    actionKeyPrefix:
      newCriticalAuditIssueInvestigationDescriptor.actionKeyPrefix,
    insight: {
      id: insightId,
      ...insightFact,
      factHash: await sha256Hex(JSON.stringify(insightFact)),
    },
    recommendation: {
      id: recommendationId,
      ...recommendationFact,
      factHash: await sha256Hex(JSON.stringify(recommendationFact)),
    },
  });
  const decision = await GrowthOpportunityDecisionsRepository.getSignalDecision(
    input.projectId,
    input.runId,
    input.signal.id,
  );
  if (!decision)
    throw new AppError("CONFLICT", "Growth opportunity decision was not saved");
  return decision;
}
