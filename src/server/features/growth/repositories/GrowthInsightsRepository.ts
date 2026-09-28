import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { BatchExecutor } from "@/db/runBatch";
import {
  growthInsightSignals,
  growthInsights,
  growthRecommendationInsights,
  growthRecommendationSteps,
  growthRecommendationTargets,
  growthRecommendations,
  growthRuns,
  growthSignals,
  projects,
} from "@/db/schema";
import {
  createInsightGraph,
  createRecommendationGraph,
} from "./GrowthInsightsGraphWriter";

export type GrowthInsightRow = typeof growthInsights.$inferSelect;
export type GrowthRecommendationRow = typeof growthRecommendations.$inferSelect;

async function getInsight(projectId: string, id: string) {
  const [row] = await db
    .select()
    .from(growthInsights)
    .where(
      and(eq(growthInsights.projectId, projectId), eq(growthInsights.id, id)),
    )
    .limit(1);
  return row ?? null;
}
async function getInsightGraph(projectId: string, runId: string, id: string) {
  const insight = await getInsight(projectId, id);
  if (!insight || insight.runId !== runId) return null;
  return {
    insight,
    signalIds: (await listInsightSignalIds(projectId, runId, id)).map(
      (row) => row.signalId,
    ),
  };
}
async function getRecommendation(projectId: string, id: string) {
  const [row] = await db
    .select()
    .from(growthRecommendations)
    .where(
      and(
        eq(growthRecommendations.projectId, projectId),
        eq(growthRecommendations.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function getRecommendationGraph(
  projectId: string,
  runId: string,
  id: string,
) {
  const recommendation = await getRecommendation(projectId, id);
  if (!recommendation || recommendation.runId !== runId) return null;
  const graph = await listRecommendationGraph(projectId, runId, id);
  return {
    recommendation,
    insightIds: graph.insights.map((row) => row.insightId),
    targets: graph.targets.map(({ targetType, targetValue }) => ({
      targetType,
      targetValue,
    })),
    steps: graph.steps.map(({ position, content }) => ({ position, content })),
  };
}
async function getInsightByKey(
  projectId: string,
  runId: string,
  creationKey: string,
) {
  const [row] = await db
    .select()
    .from(growthInsights)
    .where(
      and(
        eq(growthInsights.projectId, projectId),
        eq(growthInsights.runId, runId),
        eq(growthInsights.creationKey, creationKey),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function getRecommendationByKey(
  projectId: string,
  runId: string,
  creationKey: string,
) {
  const [row] = await db
    .select()
    .from(growthRecommendations)
    .where(
      and(
        eq(growthRecommendations.projectId, projectId),
        eq(growthRecommendations.runId, runId),
        eq(growthRecommendations.creationKey, creationKey),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function listInsightSignalIds(
  projectId: string,
  runId: string,
  insightId: string,
) {
  return db
    .select({ signalId: growthInsightSignals.signalId })
    .from(growthInsightSignals)
    .where(
      and(
        eq(growthInsightSignals.projectId, projectId),
        eq(growthInsightSignals.runId, runId),
        eq(growthInsightSignals.insightId, insightId),
      ),
    )
    .orderBy(growthInsightSignals.signalId);
}
async function listRecommendationGraph(
  projectId: string,
  runId: string,
  recommendationId: string,
) {
  const [insights, targets, steps] = await Promise.all([
    db
      .select({ insightId: growthRecommendationInsights.insightId })
      .from(growthRecommendationInsights)
      .where(
        and(
          eq(growthRecommendationInsights.projectId, projectId),
          eq(growthRecommendationInsights.runId, runId),
          eq(growthRecommendationInsights.recommendationId, recommendationId),
        ),
      )
      .orderBy(growthRecommendationInsights.insightId),
    db
      .select()
      .from(growthRecommendationTargets)
      .where(
        and(
          eq(growthRecommendationTargets.projectId, projectId),
          eq(growthRecommendationTargets.runId, runId),
          eq(growthRecommendationTargets.recommendationId, recommendationId),
        ),
      )
      .orderBy(
        growthRecommendationTargets.targetType,
        growthRecommendationTargets.targetValue,
      ),
    db
      .select()
      .from(growthRecommendationSteps)
      .where(
        and(
          eq(growthRecommendationSteps.projectId, projectId),
          eq(growthRecommendationSteps.runId, runId),
          eq(growthRecommendationSteps.recommendationId, recommendationId),
        ),
      )
      .orderBy(growthRecommendationSteps.position),
  ]);
  return { insights, targets, steps };
}

async function projectDomain(projectId: string) {
  const [row] = await db
    .select({ domain: projects.domain })
    .from(projects)
    .where(and(eq(projects.id, projectId), sql`${projects.archivedAt} IS NULL`))
    .limit(1);
  return row?.domain ?? null;
}
async function signalIdsInRun(
  projectId: string,
  runId: string,
  signalIds: string[],
) {
  if (signalIds.length === 0) return [];
  return db
    .select({ id: growthSignals.id })
    .from(growthSignals)
    .where(
      and(
        eq(growthSignals.projectId, projectId),
        eq(growthSignals.runId, runId),
        inArray(growthSignals.id, signalIds),
      ),
    );
}
async function insightIdsInRun(
  projectId: string,
  runId: string,
  insightIds: string[],
) {
  if (insightIds.length === 0) return [];
  return db
    .select({ id: growthInsights.id })
    .from(growthInsights)
    .where(
      and(
        eq(growthInsights.projectId, projectId),
        eq(growthInsights.runId, runId),
        inArray(growthInsights.id, insightIds),
      ),
    );
}
async function runState(projectId: string, runId: string) {
  const [row] = await db
    .select({ status: growthRuns.status })
    .from(growthRuns)
    .where(and(eq(growthRuns.projectId, projectId), eq(growthRuns.id, runId)))
    .limit(1);
  return row?.status ?? null;
}
async function recommendationDestination(
  projectId: string,
  runId: string,
  recommendationId: string,
) {
  const [row] = await db
    .select()
    .from(growthRecommendations)
    .where(
      and(
        eq(growthRecommendations.projectId, projectId),
        eq(growthRecommendations.runId, runId),
        eq(growthRecommendations.id, recommendationId),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function findRecommendationForSignal(
  projectId: string,
  signalId: string,
  creationKey: string,
) {
  const [row] = await db
    .select({
      id: growthRecommendations.id,
      runId: growthRecommendations.runId,
    })
    .from(growthRecommendations)
    .innerJoin(
      growthRecommendationInsights,
      and(
        eq(
          growthRecommendationInsights.projectId,
          growthRecommendations.projectId,
        ),
        eq(growthRecommendationInsights.runId, growthRecommendations.runId),
        eq(
          growthRecommendationInsights.recommendationId,
          growthRecommendations.id,
        ),
      ),
    )
    .innerJoin(
      growthInsightSignals,
      and(
        eq(
          growthInsightSignals.projectId,
          growthRecommendationInsights.projectId,
        ),
        eq(growthInsightSignals.runId, growthRecommendationInsights.runId),
        eq(
          growthInsightSignals.insightId,
          growthRecommendationInsights.insightId,
        ),
      ),
    )
    .where(
      and(
        eq(growthRecommendations.projectId, projectId),
        eq(growthRecommendations.creationKey, creationKey),
        eq(growthInsightSignals.signalId, signalId),
      ),
    )
    .limit(1);
  return row ?? null;
}
type RecommendationReviewInput = {
  projectId: string;
  recommendationId: string;
  expectedStatus: GrowthRecommendationRow["status"];
  expectedVersion: number;
  status: GrowthRecommendationRow["status"];
  dismissalReason: string | null;
  snoozedUntil: string | null;
  resolutionRecommendationId: string | null;
  reviewedAt: string | null;
};

export function buildRecommendationReviewStatement(
  tx: BatchExecutor,
  input: RecommendationReviewInput,
  guard?: SQL,
) {
  return tx
    .update(growthRecommendations)
    .set({
      status: input.status,
      reviewVersion: sql`${growthRecommendations.reviewVersion} + 1`,
      dismissalReason: input.dismissalReason,
      snoozedUntil: input.snoozedUntil,
      resolutionRecommendationId: input.resolutionRecommendationId,
      reviewedAt: input.reviewedAt,
    })
    .where(
      and(
        eq(growthRecommendations.projectId, input.projectId),
        eq(growthRecommendations.id, input.recommendationId),
        eq(growthRecommendations.status, input.expectedStatus),
        eq(growthRecommendations.reviewVersion, input.expectedVersion),
        guard,
      ),
    );
}

async function compareAndSetRecommendationReview(
  input: RecommendationReviewInput,
) {
  const [row] = await buildRecommendationReviewStatement(db, input).returning();
  return row ?? null;
}

export const GrowthInsightsRepository = {
  getInsight,
  getInsightGraph,
  getRecommendation,
  getRecommendationGraph,
  getInsightByKey,
  getRecommendationByKey,
  listInsightSignalIds,
  listRecommendationGraph,
  projectDomain,
  signalIdsInRun,
  insightIdsInRun,
  runState,
  createInsightGraph,
  createRecommendationGraph,
  recommendationDestination,
  findRecommendationForSignal,
  compareAndSetRecommendationReview,
} as const;
