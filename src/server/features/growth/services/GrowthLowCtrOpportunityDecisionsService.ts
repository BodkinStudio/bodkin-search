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
import { lowCtrInvestigationTemplate } from "./GrowthInvestigationTemplate";
import { lowCtrInvestigationDescriptor } from "./GrowthInvestigationTemplateDescriptor";
import { normalizeGrowthTargets } from "./GrowthTargetNormalizer";
import {
  HIGH_IMPRESSION_LOW_CTR_OPPORTUNITY_POLICY_VERSION,
  highImpressionLowCtrOpportunityDedupeKey,
} from "./HighImpressionLowCtrOpportunityPolicy";

type SavedSignal = RecordGrowthSignalInput & { id: string };

function actualDelta(signal: SavedSignal) {
  return signal.deltaValue === signal.currentValue - signal.baselineValue;
}

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

export async function recordLowCtrInvestigation(input: {
  projectId: string;
  runId: string;
  signals: {
    ctr: SavedSignal;
    clicks: SavedSignal;
    impressions: SavedSignal;
    averagePosition: SavedSignal;
  };
  query: string;
  page: string;
  site: string;
  commercialWeight: number | null;
}) {
  const expected = [
    [input.signals.ctr, "gsc_ctr"],
    [input.signals.clicks, "gsc_clicks"],
    [input.signals.impressions, "gsc_impressions"],
    [input.signals.averagePosition, "gsc_average_position"],
  ] as const;
  const controller = input.signals.ctr;
  const normalizedQuery = input.query.trim().replace(/\s+/g, " ").toLowerCase();
  const first = controller;
  if (
    !normalizedQuery ||
    controller.projectId !== input.projectId ||
    controller.runId !== input.runId ||
    new Set(expected.map(([signal]) => signal.id)).size !== 4 ||
    !expected.every(
      ([signal, metric]) =>
        signal.signalType ===
          lowCtrInvestigationDescriptor.controller.signalType &&
        signal.entityType ===
          lowCtrInvestigationDescriptor.controller.entityType &&
        signal.entityRef.trim().replace(/\s+/g, " ").toLowerCase() ===
          normalizedQuery &&
        signal.metric === metric &&
        signal.evidenceKind ===
          lowCtrInvestigationDescriptor.controller.evidenceKind &&
        signal.runId === first.runId &&
        signal.periodStart === first.periodStart &&
        signal.periodEnd === first.periodEnd &&
        signal.capturedAt === first.capturedAt &&
        signal.evidenceRef === first.evidenceRef &&
        actualDelta(signal),
    )
  )
    throw new AppError("VALIDATION_ERROR", "Growth Signals are not eligible");

  const existing = await GrowthOpportunityDecisionsRepository.getSignalDecision(
    input.projectId,
    input.runId,
    controller.id,
  );
  if (existing) return existing;

  const template = lowCtrInvestigationTemplate(input);
  const steps = template.recommendation.steps.map((content, position) => ({
    position,
    content: content.trim().replace(/\s+/g, " "),
  }));
  const domain = await GrowthInsightsRepository.projectDomain(input.projectId);
  if (!domain) throw new AppError("NOT_FOUND", "Growth project not found");
  const url = normalizeKeyPageUrl(input.page);
  if (url.length > 2000)
    throw new AppError("VALIDATION_ERROR", "Target URL is too long");
  const project = parseResearchTarget(domain, "subdomains");
  if (!project.ok || !urlMatchesResearchTarget(url, project.target))
    throw new AppError(
      "VALIDATION_ERROR",
      "Targets must belong to the project domain",
    );
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
  const keyword = targets.find((target) => target.targetType === "keyword");
  const page = targets.find((target) => target.targetType === "url");
  const site = targets.find((target) => target.targetType === "site");
  if (!keyword || !page || !site)
    throw new AppError("VALIDATION_ERROR", "Growth targets are not eligible");

  const dedupeKey = await highImpressionLowCtrOpportunityDedupeKey({
    projectId: input.projectId,
    query: keyword.targetValue,
    canonicalUrl: page.targetValue,
  });
  const signalIds = [...new Set(template.insight.signalIds)].toSorted();
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
    signalIds,
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
    steps,
  };
  const recommendationId = await deterministicId({
    projectId: input.projectId,
    dedupeKey,
    kind: "recommendation",
  });
  await GrowthOpportunityDecisionsRepository.writeDecision({
    projectId: input.projectId,
    signalRunId: input.runId,
    signalId: controller.id,
    dedupeKey,
    policyVersion: HIGH_IMPRESSION_LOW_CTR_OPPORTUNITY_POLICY_VERSION,
    actionKeyPrefix: lowCtrInvestigationDescriptor.actionKeyPrefix,
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
    controller.id,
  );
  if (!decision)
    throw new AppError("CONFLICT", "Growth opportunity decision was not saved");
  return decision;
}
