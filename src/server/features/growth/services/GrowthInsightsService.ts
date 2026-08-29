import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type {
  CreateGrowthInsightInput,
  CreateGrowthRecommendationInput,
  ReviewGrowthRecommendationInput,
} from "@/types/schemas/growth";
import { GrowthInsightsRepository as repo } from "../repositories/GrowthInsightsRepository";
import { normalizeGrowthTargets } from "./GrowthTargetNormalizer";

const ids = (values: string[]) => [...new Set(values)].toSorted();
async function running(projectId: string, runId: string) {
  const status = await repo.runState(projectId, runId);
  if (!status) throw new AppError("NOT_FOUND", "Growth run not found");
  if (status !== "running")
    throw new AppError("CONFLICT", "Growth run is no longer running");
}
async function targets(
  projectId: string,
  values: CreateGrowthRecommendationInput["targets"],
) {
  const domain = await repo.projectDomain(projectId);
  if (!domain) throw new AppError("NOT_FOUND", "Growth project not found");
  return normalizeGrowthTargets(domain, values);
}

function insightFact(input: CreateGrowthInsightInput, signalIds: string[]) {
  return {
    projectId: input.projectId,
    runId: input.runId,
    creationKey: input.creationKey,
    title: input.title,
    explanation: input.explanation,
    hypothesis: input.hypothesis,
    confidence: input.confidence,
    model: input.model ?? null,
    promptVersion: input.promptVersion ?? null,
    signalIds,
  };
}

async function readInsightGraph(
  projectId: string,
  runId: string,
  insightId: string,
  signalIds: string[],
) {
  const graph = await repo.getInsightGraph(projectId, runId, insightId);
  if (!graph) throw new AppError("NOT_FOUND", "Growth Insight not found");
  if (JSON.stringify(graph.signalIds) !== JSON.stringify(signalIds)) {
    throw new AppError(
      "CONFLICT",
      "Stored Growth Insight graph does not match its immutable fact",
    );
  }
  return graph;
}

async function createInsight(input: CreateGrowthInsightInput) {
  const signalIds = ids(input.signalIds);
  const factHash = await sha256Hex(
    JSON.stringify(insightFact(input, signalIds)),
  );
  const existing = await repo.getInsightByKey(
    input.projectId,
    input.runId,
    input.creationKey,
  );
  if (existing) {
    if (existing.factHash !== factHash)
      throw new AppError(
        "CONFLICT",
        "Growth Insight creation key is occupied by a different immutable fact",
      );
    return readInsightGraph(
      input.projectId,
      input.runId,
      existing.id,
      signalIds,
    );
  }
  await running(input.projectId, input.runId);
  if (
    (await repo.signalIdsInRun(input.projectId, input.runId, signalIds))
      .length !== signalIds.length
  )
    throw new AppError("NOT_FOUND", "Growth Signal not found in this run");
  await repo.createInsightGraph({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    runId: input.runId,
    creationKey: input.creationKey,
    factHash,
    title: input.title,
    explanation: input.explanation,
    hypothesis: input.hypothesis,
    confidence: input.confidence,
    model: input.model ?? null,
    promptVersion: input.promptVersion ?? null,
    signalIds,
  });
  const winner = await repo.getInsightByKey(
    input.projectId,
    input.runId,
    input.creationKey,
  );
  if (!winner) {
    await running(input.projectId, input.runId);
    throw new AppError("CONFLICT", "Growth Insight was not created");
  }
  if (winner.factHash !== factHash)
    throw new AppError(
      "CONFLICT",
      "Growth Insight creation key is occupied by a different immutable fact",
    );
  return readInsightGraph(input.projectId, input.runId, winner.id, signalIds);
}

function recommendationFact(
  input: CreateGrowthRecommendationInput,
  insightIds: string[],
  normalizedTargets: Awaited<ReturnType<typeof targets>>,
  steps: { position: number; content: string }[],
) {
  return {
    projectId: input.projectId,
    runId: input.runId,
    creationKey: input.creationKey,
    title: input.title,
    rationale: input.rationale,
    category: input.category,
    impact: input.impact,
    commercialRelevance: input.commercialRelevance,
    effort: input.effort,
    urgency: input.urgency,
    confidence: input.confidence,
    priorityScore: input.priorityScore,
    model: input.model ?? null,
    promptVersion: input.promptVersion ?? null,
    insightIds,
    targets: normalizedTargets,
    steps,
  };
}

async function readRecommendationGraph(
  projectId: string,
  runId: string,
  recommendationId: string,
  expected: {
    insightIds: string[];
    targets: Awaited<ReturnType<typeof targets>>;
    steps: { position: number; content: string }[];
  },
) {
  const graph = await repo.getRecommendationGraph(
    projectId,
    runId,
    recommendationId,
  );
  if (!graph)
    throw new AppError("NOT_FOUND", "Growth Recommendation not found");
  if (
    JSON.stringify(graph.insightIds) !== JSON.stringify(expected.insightIds) ||
    JSON.stringify(graph.targets) !== JSON.stringify(expected.targets) ||
    JSON.stringify(graph.steps) !== JSON.stringify(expected.steps)
  ) {
    throw new AppError(
      "CONFLICT",
      "Stored Growth Recommendation graph does not match its immutable fact",
    );
  }
  return graph;
}

async function createRecommendation(input: CreateGrowthRecommendationInput) {
  const insightIds = ids(input.insightIds);
  const normalizedTargets = await targets(input.projectId, input.targets);
  const steps = input.steps.map((content, position) => ({
    position,
    content: content.trim().replace(/\s+/g, " "),
  }));
  const factHash = await sha256Hex(
    JSON.stringify(
      recommendationFact(input, insightIds, normalizedTargets, steps),
    ),
  );
  const existing = await repo.getRecommendationByKey(
    input.projectId,
    input.runId,
    input.creationKey,
  );
  if (existing) {
    if (existing.factHash !== factHash)
      throw new AppError(
        "CONFLICT",
        "Growth Recommendation creation key is occupied by a different immutable fact",
      );
    return readRecommendationGraph(input.projectId, input.runId, existing.id, {
      insightIds,
      targets: normalizedTargets,
      steps,
    });
  }
  await running(input.projectId, input.runId);
  if (
    (await repo.insightIdsInRun(input.projectId, input.runId, insightIds))
      .length !== insightIds.length
  )
    throw new AppError("NOT_FOUND", "Growth Insight not found in this run");
  await repo.createRecommendationGraph({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    runId: input.runId,
    creationKey: input.creationKey,
    factHash,
    title: input.title,
    rationale: input.rationale,
    category: input.category,
    impact: input.impact,
    commercialRelevance: input.commercialRelevance,
    effort: input.effort,
    urgency: input.urgency,
    confidence: input.confidence,
    priorityScore: input.priorityScore,
    model: input.model ?? null,
    promptVersion: input.promptVersion ?? null,
    insightIds,
    targets: normalizedTargets,
    steps,
  });
  const winner = await repo.getRecommendationByKey(
    input.projectId,
    input.runId,
    input.creationKey,
  );
  if (!winner) {
    await running(input.projectId, input.runId);
    throw new AppError("CONFLICT", "Growth Recommendation was not created");
  }
  if (winner.factHash !== factHash)
    throw new AppError(
      "CONFLICT",
      "Growth Recommendation creation key is occupied by a different immutable fact",
    );
  return readRecommendationGraph(input.projectId, input.runId, winner.id, {
    insightIds,
    targets: normalizedTargets,
    steps,
  });
}
const legal = (from: string, to: string) =>
  from === "proposed"
    ? ["accepted", "dismissed", "snoozed", "merged", "superseded"].includes(to)
    : from === "snoozed" && to === "proposed";
async function reviewRecommendation(input: ReviewGrowthRecommendationInput) {
  const row = await repo.getRecommendation(
    input.projectId,
    input.recommendationId,
  );
  if (!row) throw new AppError("NOT_FOUND", "Growth Recommendation not found");
  const dismissalReason = input.dismissalReason ?? null;
  const snoozedUntil = input.snoozedUntil ?? null;
  const resolutionRecommendationId = input.resolutionRecommendationId ?? null;
  const replayExpectedStatus =
    input.status === "proposed" ? "snoozed" : "proposed";
  if (
    input.expectedStatus === replayExpectedStatus &&
    row.reviewVersion === input.expectedVersion + 1 &&
    row.status === input.status &&
    row.dismissalReason === dismissalReason &&
    row.snoozedUntil === snoozedUntil &&
    row.resolutionRecommendationId === resolutionRecommendationId
  )
    return row;
  if (input.status === "snoozed") {
    const snoozedUntilMs = new Date(input.snoozedUntil ?? "").valueOf();
    if (!Number.isFinite(snoozedUntilMs) || snoozedUntilMs <= Date.now())
      throw new AppError(
        "VALIDATION_ERROR",
        "A new snooze must end in the future",
      );
  }
  if (
    row.status !== input.expectedStatus ||
    row.reviewVersion !== input.expectedVersion ||
    !legal(row.status, input.status)
  )
    throw new AppError(
      "CONFLICT",
      "Growth Recommendation review is stale or illegal",
    );
  if (resolutionRecommendationId) {
    if (resolutionRecommendationId === input.recommendationId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "A Recommendation cannot resolve itself",
      );
    }
    const dest = await repo.recommendationDestination(
      input.projectId,
      row.runId,
      resolutionRecommendationId,
    );
    if (!dest)
      throw new AppError("NOT_FOUND", "Resolution Recommendation not found");
    if (["merged", "superseded"].includes(dest.status))
      throw new AppError("CONFLICT", "Resolution Recommendation is terminal");
  }
  const updated = await repo.compareAndSetRecommendationReview({
    projectId: input.projectId,
    recommendationId: input.recommendationId,
    expectedStatus: input.expectedStatus,
    expectedVersion: input.expectedVersion,
    status: input.status,
    dismissalReason,
    snoozedUntil,
    resolutionRecommendationId,
    reviewedAt: input.status === "proposed" ? null : new Date().toISOString(),
  });
  if (!updated)
    throw new AppError("CONFLICT", "Growth Recommendation review is stale");
  return updated;
}
export const GrowthInsightsService = {
  createInsight,
  createRecommendation,
  reviewRecommendation,
  getInsight: repo.getInsightGraph,
  getRecommendation: repo.getRecommendationGraph,
} as const;
