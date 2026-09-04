import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import { normalizeKeyPageUrl } from "@/server/features/project-context/services/contextUpdateOps";
import {
  parseResearchTarget,
  urlMatchesResearchTarget,
} from "@/shared/researchScope";
import type { RecordGrowthSignalInput } from "@/types/schemas/growth";
import { GrowthInsightsRepository } from "../repositories/GrowthInsightsRepository";
import { GrowthOpportunityDecisionsRepository } from "../repositories/GrowthOpportunityDecisionsRepository";
import {
  PRIORITY_PAGE_OPPORTUNITY_POLICY_VERSION,
  isPriorityPageControllerReleasable,
  priorityPageControllerCycleKey,
  priorityPageOpportunityDedupeKey,
} from "./PriorityPageOpportunityPolicy";
import { normalizeGrowthTargets } from "./GrowthTargetNormalizer";
import {
  priorityPageInvestigationTemplate,
  strikingDistanceInvestigationTemplate,
} from "./GrowthInvestigationTemplate";
import {
  STRIKING_DISTANCE_OPPORTUNITY_POLICY_VERSION,
  strikingDistanceOpportunityDedupeKey,
} from "./StrikingDistanceOpportunityPolicy";
import {
  priorityPageInvestigationDescriptor,
  strikingDistanceInvestigationDescriptor,
} from "./GrowthInvestigationTemplateDescriptor";
import { recordLowCtrInvestigation } from "./GrowthLowCtrOpportunityDecisionsService";

function ids(values: string[]) {
  return [...new Set(values)].toSorted();
}

async function deterministicId(input: {
  projectId: string;
  dedupeKey: string;
  cycleKey: string;
  kind: "insight" | "recommendation";
}) {
  return (
    await sha256Hex(
      `${input.projectId}|${input.dedupeKey}|${input.cycleKey}|${input.kind}`,
    )
  ).slice(0, 36);
}

async function recordPriorityPageInvestigation(input: {
  projectId: string;
  runId: string;
  signal: RecordGrowthSignalInput & { id: string };
  keyPage: { id: string; url: string; commercialWeight: number | null };
}) {
  if (
    input.signal.signalType !== "priority_page_click_decline" ||
    input.signal.entityType !== "key_page" ||
    input.signal.entityRef !== input.keyPage.id ||
    input.signal.metric !== "gsc_clicks" ||
    input.signal.evidenceKind !== "gsc_period"
  )
    throw new AppError("VALIDATION_ERROR", "Growth Signal is not eligible");

  const existing = await GrowthOpportunityDecisionsRepository.getSignalDecision(
    input.projectId,
    input.runId,
    input.signal.id,
  );
  if (existing) return existing;

  const template = priorityPageInvestigationTemplate(input);
  const steps = template.recommendation.steps.map((content, position) => ({
    position,
    content: content.trim().replace(/\s+/g, " "),
  }));
  const [dedupeKey, domain, legacy] = await Promise.all([
    priorityPageOpportunityDedupeKey({
      projectId: input.projectId,
      keyPageId: input.keyPage.id,
    }),
    GrowthInsightsRepository.projectDomain(input.projectId),
    GrowthOpportunityDecisionsRepository.findLegacyPriorityPageController(
      input.projectId,
      input.keyPage.id,
      steps,
    ),
  ]);
  if (!domain) throw new AppError("NOT_FOUND", "Growth project not found");
  const activeController =
    await GrowthOpportunityDecisionsRepository.getActiveControllerReleasePreflight(
      input.projectId,
      dedupeKey,
      input.runId,
      input.signal.id,
    );
  const releaseController =
    priorityPageInvestigationDescriptor.releasesControllers &&
    activeController &&
    isPriorityPageControllerReleasable({
      capturedAt: activeController.capturedAt,
      actionStatus: activeController.actionStatus,
      evaluatedAt: activeController.evaluatedAt,
    })
      ? activeController
      : null;
  const cycleKey = priorityPageControllerCycleKey(
    releaseController?.recommendationId ?? null,
  );
  const signalIds = ids(template.insight.signalIds);
  const normalizedTargets = normalizeGrowthTargets(
    domain,
    template.recommendation.targets,
  );
  const insightFact = {
    projectId: input.projectId,
    runId: input.runId,
    creationKey: template.insight.creationKey,
    title: template.insight.title,
    explanation: template.insight.explanation,
    hypothesis: template.insight.hypothesis,
    confidence: template.insight.confidence,
    model: template.insight.model ?? null,
    promptVersion: template.insight.promptVersion ?? null,
    signalIds,
  };
  const recommendationFact: {
    projectId: string;
    runId: string;
    creationKey: string;
    title: string;
    rationale: string;
    category: string;
    impact: number;
    commercialRelevance: number;
    effort: number;
    urgency: number;
    confidence: number;
    priorityScore: number;
    model: string | null;
    promptVersion: string | null;
    insightIds: string[];
    targets: typeof normalizedTargets;
    steps: typeof steps;
  } = {
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
    model: template.recommendation.model ?? null,
    promptVersion: template.recommendation.promptVersion ?? null,
    insightIds: [],
    targets: normalizedTargets,
    steps,
  };
  const insightId = await deterministicId({
    projectId: input.projectId,
    dedupeKey,
    cycleKey,
    kind: "insight",
  });
  recommendationFact.insightIds = [insightId];
  const recommendationId = await deterministicId({
    projectId: input.projectId,
    dedupeKey,
    cycleKey,
    kind: "recommendation",
  });
  await GrowthOpportunityDecisionsRepository.writeDecision({
    projectId: input.projectId,
    signalRunId: input.runId,
    signalId: input.signal.id,
    dedupeKey,
    policyVersion: PRIORITY_PAGE_OPPORTUNITY_POLICY_VERSION,
    actionKeyPrefix: priorityPageInvestigationDescriptor.actionKeyPrefix,
    releaseController: releaseController
      ? {
          recommendationId: releaseController.recommendationId,
          signalRunId: releaseController.signalRunId,
          signalId: releaseController.signalId,
        }
      : null,
    legacyController: activeController
      ? null
      : legacy
        ? { ...legacy, keyPageId: input.keyPage.id }
        : null,
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

type SavedSignal = RecordGrowthSignalInput & { id: string };

function actualDelta(signal: SavedSignal) {
  return signal.deltaValue === signal.currentValue - signal.baselineValue;
}

function eligibleStrikingSignals(input: {
  signals: {
    averagePosition: SavedSignal;
    impressions: SavedSignal;
    clicks: SavedSignal;
  };
  query: string;
}) {
  const signals = input.signals;
  const expected = [
    [signals.averagePosition, "gsc_average_position"],
    [signals.impressions, "gsc_impressions"],
    [signals.clicks, "gsc_clicks"],
  ] as const;
  const query = input.query.trim().replace(/\s+/g, " ").toLowerCase();
  if (!query || new Set(expected.map(([signal]) => signal.id)).size !== 3)
    return false;
  const first = signals.impressions;
  return expected.every(
    ([signal, metric]) =>
      signal.signalType ===
        strikingDistanceInvestigationDescriptor.controller.signalType &&
      signal.entityType ===
        strikingDistanceInvestigationDescriptor.controller.entityType &&
      signal.entityRef.trim().replace(/\s+/g, " ").toLowerCase() === query &&
      signal.metric === metric &&
      signal.evidenceKind ===
        strikingDistanceInvestigationDescriptor.controller.evidenceKind &&
      signal.runId === first.runId &&
      signal.periodStart === first.periodStart &&
      signal.periodEnd === first.periodEnd &&
      signal.capturedAt === first.capturedAt &&
      signal.evidenceRef === first.evidenceRef &&
      actualDelta(signal),
  );
}

async function recordStrikingDistanceInvestigation(input: {
  projectId: string;
  runId: string;
  signals: {
    averagePosition: SavedSignal;
    impressions: SavedSignal;
    clicks: SavedSignal;
  };
  query: string;
  page: string;
  site: string;
  commercialWeight: number | null;
}) {
  const controller = input.signals.impressions;
  if (
    controller.projectId !== input.projectId ||
    controller.runId !== input.runId ||
    !eligibleStrikingSignals(input)
  )
    throw new AppError("VALIDATION_ERROR", "Growth Signals are not eligible");

  const existing = await GrowthOpportunityDecisionsRepository.getSignalDecision(
    input.projectId,
    input.runId,
    controller.id,
  );
  if (existing) return existing;

  const template = strikingDistanceInvestigationTemplate(input);
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
  const normalizedTargets = [
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
  const keyword = normalizedTargets.find(
    (target) => target.targetType === "keyword",
  );
  const urlTarget = normalizedTargets.find(
    (target) => target.targetType === "url",
  );
  const site = normalizedTargets.find((target) => target.targetType === "site");
  if (!keyword || !urlTarget || !site)
    throw new AppError("VALIDATION_ERROR", "Growth targets are not eligible");
  const dedupeKey = await strikingDistanceOpportunityDedupeKey({
    projectId: input.projectId,
    query: keyword.targetValue,
    canonicalUrl: urlTarget.targetValue,
  });
  const signalIds = ids(template.insight.signalIds);
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
    cycleKey: "initial-controller",
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
    targets: normalizedTargets,
    steps,
  };
  const recommendationId = await deterministicId({
    projectId: input.projectId,
    dedupeKey,
    cycleKey: "initial-controller",
    kind: "recommendation",
  });
  await GrowthOpportunityDecisionsRepository.writeDecision({
    projectId: input.projectId,
    signalRunId: input.runId,
    signalId: controller.id,
    dedupeKey,
    policyVersion: STRIKING_DISTANCE_OPPORTUNITY_POLICY_VERSION,
    actionKeyPrefix: strikingDistanceInvestigationDescriptor.actionKeyPrefix,
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

export const GrowthOpportunityDecisionsService = {
  recordPriorityPageInvestigation,
  recordStrikingDistanceInvestigation,
  recordLowCtrInvestigation,
  getDecision: GrowthOpportunityDecisionsRepository.getSignalDecision,
} as const;
