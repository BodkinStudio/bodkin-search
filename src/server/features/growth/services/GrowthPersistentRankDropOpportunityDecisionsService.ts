import { normalizeKeyPageUrl } from "@/server/features/project-context/services/contextUpdateOps";
import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import {
  parseResearchTarget,
  urlMatchesResearchTarget,
} from "@/shared/researchScope";
import type { RecordGrowthSignalInput } from "@/types/schemas/growth";
import { GrowthInsightsRepository } from "../repositories/GrowthInsightsRepository";
import { GrowthOpportunityDecisionsRepository } from "../repositories/GrowthOpportunityDecisionsRepository";
import { persistentRankDropInvestigationTemplate } from "./GrowthInvestigationTemplate";
import { persistentRankDropInvestigationDescriptor } from "./GrowthInvestigationTemplateDescriptor";
import { normalizeGrowthTargets } from "./GrowthTargetNormalizer";
import {
  parsePersistentRankDropEvidenceRef,
  PERSISTENT_RANK_DROP_POLICY,
  type PersistentRankDropCandidate,
} from "./PersistentTrackedRankDropDetector";
import {
  PERSISTENT_RANK_DROP_OPPORTUNITY_POLICY_VERSION,
  persistentRankDropOpportunityDedupeKey,
} from "./PersistentRankDropOpportunityPolicy";

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

export async function recordPersistentRankDropInvestigation(input: {
  projectId: string;
  runId: string;
  signal: SavedSignal;
  candidate: Omit<PersistentRankDropCandidate, "signal" | "status">;
}) {
  const { signal, candidate } = input;
  const evidence = parsePersistentRankDropEvidenceRef(signal.evidenceRef);
  const baselinePosition = candidate.snapshots[0]?.position;
  const laterFloors = candidate.snapshots
    .slice(1)
    .map((snapshot) => snapshot.position ?? candidate.serpDepth + 1);
  if (
    signal.projectId !== input.projectId ||
    signal.runId !== input.runId ||
    signal.signalType !==
      persistentRankDropInvestigationDescriptor.controller.signalType ||
    signal.entityType !==
      persistentRankDropInvestigationDescriptor.controller.entityType ||
    signal.entityRef !== candidate.trackingKeywordId ||
    signal.metric !==
      persistentRankDropInvestigationDescriptor.controller.metric ||
    signal.evidenceKind !==
      persistentRankDropInvestigationDescriptor.controller.evidenceKind ||
    signal.deltaValue !== signal.currentValue - signal.baselineValue ||
    !evidence ||
    evidence.serpDepth !== candidate.serpDepth ||
    evidence.snapshotIds.join(",") !==
      candidate.snapshots.map(({ id }) => id).join(",") ||
    new Set(candidate.snapshots.map(({ runId }) => runId)).size !== 4 ||
    baselinePosition === null ||
    baselinePosition === undefined ||
    laterFloors.some(
      (position) =>
        position - baselinePosition <
        PERSISTENT_RANK_DROP_POLICY.minimumPositionLoss,
    ) ||
    signal.baselineValue !== baselinePosition ||
    signal.currentValue !== laterFloors.at(-1)
  )
    throw new AppError("VALIDATION_ERROR", "Growth Signal is not eligible");

  const existing = await GrowthOpportunityDecisionsRepository.getSignalDecision(
    input.projectId,
    input.runId,
    signal.id,
  );
  if (existing) return existing;

  const domain = await GrowthInsightsRepository.projectDomain(input.projectId);
  if (!domain) throw new AppError("NOT_FOUND", "Growth project not found");
  const url = normalizeKeyPageUrl(candidate.priorityPageUrl);
  if (url.length > 2000)
    throw new AppError("VALIDATION_ERROR", "Target URL is too long");
  const project = parseResearchTarget(domain, "subdomains");
  if (!project.ok || !urlMatchesResearchTarget(url, project.target))
    throw new AppError(
      "VALIDATION_ERROR",
      "Targets must belong to the project domain",
    );

  const template = persistentRankDropInvestigationTemplate({
    projectId: input.projectId,
    runId: input.runId,
    signal,
    keyword: candidate.keyword,
    device: candidate.device,
    page: url,
    site: domain,
    commercialWeight: candidate.commercialWeight,
    serpDepth: candidate.serpDepth,
    positions: candidate.snapshots.map(({ position }) => position),
  });
  const targets = [
    ...normalizeGrowthTargets(
      domain,
      template.recommendation.targets.filter((target) => target.type !== "url"),
    ),
    { targetType: "url" as const, targetValue: url },
  ].toSorted((left, right) =>
    `${left.targetType}:${left.targetValue}`.localeCompare(
      `${right.targetType}:${right.targetValue}`,
    ),
  );
  if (
    !targets.some((target) => target.targetType === "keyword") ||
    !targets.some((target) => target.targetType === "site")
  )
    throw new AppError("VALIDATION_ERROR", "Growth targets are not eligible");
  const dedupeKey = await persistentRankDropOpportunityDedupeKey({
    projectId: input.projectId,
    configId: candidate.configId,
    trackingKeywordId: candidate.trackingKeywordId,
    device: candidate.device,
    canonicalUrl: url,
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
    signalIds: [signal.id],
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
    signalId: signal.id,
    dedupeKey,
    policyVersion: PERSISTENT_RANK_DROP_OPPORTUNITY_POLICY_VERSION,
    actionKeyPrefix: persistentRankDropInvestigationDescriptor.actionKeyPrefix,
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
    signal.id,
  );
  if (!decision)
    throw new AppError("CONFLICT", "Growth opportunity decision was not saved");
  return decision;
}
