import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type { RecordGrowthSignalInput } from "@/types/schemas/growth";
import { GrowthInsightsRepository } from "../repositories/GrowthInsightsRepository";
import { GrowthOpportunityDecisionsRepository } from "../repositories/GrowthOpportunityDecisionsRepository";
import {
  PRIORITY_PAGE_OPPORTUNITY_POLICY_VERSION,
  priorityPageOpportunityDedupeKey,
} from "./PriorityPageOpportunityPolicy";
import { normalizeGrowthTargets } from "./GrowthTargetNormalizer";
import { priorityPageInvestigationTemplate } from "./GrowthInvestigationTemplate";

function ids(values: string[]) {
  return [...new Set(values)].toSorted();
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
    kind: "insight",
  });
  recommendationFact.insightIds = [insightId];
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
    policyVersion: PRIORITY_PAGE_OPPORTUNITY_POLICY_VERSION,
    legacyController: legacy
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

export const GrowthOpportunityDecisionsService = {
  recordPriorityPageInvestigation,
  getDecision: GrowthOpportunityDecisionsRepository.getSignalDecision,
} as const;
