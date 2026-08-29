import { and, eq, sql } from "drizzle-orm";
import { getDatabaseProvider } from "@/db/provider";
import { runBatch } from "@/db/runBatch";
import {
  growthInsightSignals,
  growthInsights,
  growthRecommendationInsights,
  growthRecommendationSteps,
  growthRecommendationTargets,
  growthRecommendations,
  growthRuns,
} from "@/db/schema";

type InsightWrite = {
  id: string;
  projectId: string;
  runId: string;
  creationKey: string;
  factHash: string;
  title: string;
  explanation: string;
  hypothesis: string;
  confidence: number;
  model: string | null;
  promptVersion: string | null;
  signalIds: string[];
};

export async function createInsightGraph(input: InsightWrite) {
  const createdAt = new Date().toISOString();
  await runBatch((tx) => {
    const source = tx
      .select({
        id: sql<string>`${input.id}`.as("id"),
        projectId: sql<string>`${input.projectId}`.as("project_id"),
        runId: sql<string>`${input.runId}`.as("run_id"),
        creationKey: sql<string>`${input.creationKey}`.as("creation_key"),
        factHash: sql<string>`${input.factHash}`.as("fact_hash"),
        title: sql<string>`${input.title}`.as("title"),
        explanation: sql<string>`${input.explanation}`.as("explanation"),
        hypothesis: sql<string>`${input.hypothesis}`.as("hypothesis"),
        confidence: sql<number>`${input.confidence}`.as("confidence"),
        model: sql<string | null>`${input.model}`.as("model"),
        promptVersion: sql<string | null>`${input.promptVersion}`.as(
          "prompt_version",
        ),
        createdAt: sql<string>`${createdAt}`.as("created_at"),
      })
      .from(growthRuns)
      .where(
        and(
          eq(growthRuns.projectId, input.projectId),
          eq(growthRuns.id, input.runId),
          eq(growthRuns.status, "running"),
        ),
      );
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the provider guard is the runtime proof for this narrower Postgres builder surface
    const postgresSource = source as unknown as {
      for: (strength: "share") => typeof source;
    };
    const lockedSource =
      getDatabaseProvider() === "postgres"
        ? postgresSource.for("share")
        : source;
    const parent = tx
      .insert(growthInsights)
      .select(lockedSource)
      .onConflictDoNothing({
        target: [
          growthInsights.projectId,
          growthInsights.runId,
          growthInsights.creationKey,
        ],
      });
    const children = input.signalIds.map((signalId) => {
      const childSource = tx
        .select({
          projectId: growthInsights.projectId,
          runId: growthInsights.runId,
          insightId: growthInsights.id,
          signalId: sql<string>`${signalId}`.as("signal_id"),
        })
        .from(growthInsights)
        .innerJoin(
          growthRuns,
          and(
            eq(growthRuns.projectId, growthInsights.projectId),
            eq(growthRuns.id, growthInsights.runId),
          ),
        )
        .where(
          and(
            eq(growthInsights.projectId, input.projectId),
            eq(growthInsights.runId, input.runId),
            eq(growthInsights.creationKey, input.creationKey),
            eq(growthInsights.factHash, input.factHash),
            eq(growthRuns.status, "running"),
          ),
        );
      return tx
        .insert(growthInsightSignals)
        .select(childSource)
        .onConflictDoNothing({
          target: [
            growthInsightSignals.projectId,
            growthInsightSignals.runId,
            growthInsightSignals.insightId,
            growthInsightSignals.signalId,
          ],
        });
    });
    return [parent, ...children];
  });
}

type RecommendationWrite = Omit<
  InsightWrite,
  "title" | "signalIds" | "explanation" | "hypothesis" | "confidence"
> & {
  title: string;
  rationale: string;
  category: string;
  impact: number;
  commercialRelevance: number;
  effort: number;
  urgency: number;
  confidence: number;
  priorityScore: number;
  insightIds: string[];
  targets: {
    targetType: "url" | "keyword" | "cluster" | "site";
    targetValue: string;
  }[];
  steps: { position: number; content: string }[];
};

export async function createRecommendationGraph(input: RecommendationWrite) {
  const createdAt = new Date().toISOString();
  await runBatch((tx) => {
    const source = tx
      .select({
        id: sql<string>`${input.id}`.as("id"),
        projectId: sql<string>`${input.projectId}`.as("project_id"),
        runId: sql<string>`${input.runId}`.as("run_id"),
        creationKey: sql<string>`${input.creationKey}`.as("creation_key"),
        factHash: sql<string>`${input.factHash}`.as("fact_hash"),
        title: sql<string>`${input.title}`.as("title"),
        rationale: sql<string>`${input.rationale}`.as("rationale"),
        category: sql<string>`${input.category}`.as("category"),
        impact: sql<number>`${input.impact}`.as("impact"),
        commercialRelevance: sql<number>`${input.commercialRelevance}`.as(
          "commercial_relevance",
        ),
        effort: sql<number>`${input.effort}`.as("effort"),
        urgency: sql<number>`${input.urgency}`.as("urgency"),
        confidence: sql<number>`${input.confidence}`.as("confidence"),
        priorityScore: sql<number>`${input.priorityScore}`.as("priority_score"),
        model: sql<string | null>`${input.model}`.as("model"),
        promptVersion: sql<string | null>`${input.promptVersion}`.as(
          "prompt_version",
        ),
        status: sql<"proposed">`'proposed'`.as("status"),
        reviewVersion: sql<number>`0`.as("review_version"),
        snoozedUntil: sql<null>`NULL`.as("snoozed_until"),
        dismissalReason: sql<null>`NULL`.as("dismissal_reason"),
        resolutionRecommendationId: sql<null>`NULL`.as(
          "resolution_recommendation_id",
        ),
        reviewedAt: sql<null>`NULL`.as("reviewed_at"),
        createdAt: sql<string>`${createdAt}`.as("created_at"),
      })
      .from(growthRuns)
      .where(
        and(
          eq(growthRuns.projectId, input.projectId),
          eq(growthRuns.id, input.runId),
          eq(growthRuns.status, "running"),
        ),
      );
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the provider guard is the runtime proof for this narrower Postgres builder surface
    const postgresSource = source as unknown as {
      for: (strength: "share") => typeof source;
    };
    const lockedSource =
      getDatabaseProvider() === "postgres"
        ? postgresSource.for("share")
        : source;
    const parent = tx
      .insert(growthRecommendations)
      .select(lockedSource)
      .onConflictDoNothing({
        target: [
          growthRecommendations.projectId,
          growthRecommendations.runId,
          growthRecommendations.creationKey,
        ],
      });
    const parentWhere = and(
      eq(growthRecommendations.projectId, input.projectId),
      eq(growthRecommendations.runId, input.runId),
      eq(growthRecommendations.creationKey, input.creationKey),
      eq(growthRecommendations.factHash, input.factHash),
      eq(growthRuns.status, "running"),
    );
    return [
      parent,
      ...input.insightIds.map((insightId) =>
        tx
          .insert(growthRecommendationInsights)
          .select(
            tx
              .select({
                projectId: growthRecommendations.projectId,
                runId: growthRecommendations.runId,
                recommendationId: growthRecommendations.id,
                insightId: sql<string>`${insightId}`.as("insight_id"),
              })
              .from(growthRecommendations)
              .innerJoin(
                growthRuns,
                and(
                  eq(growthRuns.projectId, growthRecommendations.projectId),
                  eq(growthRuns.id, growthRecommendations.runId),
                ),
              )
              .where(parentWhere),
          )
          .onConflictDoNothing({
            target: [
              growthRecommendationInsights.projectId,
              growthRecommendationInsights.runId,
              growthRecommendationInsights.recommendationId,
              growthRecommendationInsights.insightId,
            ],
          }),
      ),
      ...input.targets.map((target) =>
        tx
          .insert(growthRecommendationTargets)
          .select(
            tx
              .select({
                projectId: growthRecommendations.projectId,
                runId: growthRecommendations.runId,
                recommendationId: growthRecommendations.id,
                targetType: sql<
                  typeof target.targetType
                >`${target.targetType}`.as("target_type"),
                targetValue: sql<string>`${target.targetValue}`.as(
                  "target_value",
                ),
              })
              .from(growthRecommendations)
              .innerJoin(
                growthRuns,
                and(
                  eq(growthRuns.projectId, growthRecommendations.projectId),
                  eq(growthRuns.id, growthRecommendations.runId),
                ),
              )
              .where(parentWhere),
          )
          .onConflictDoNothing({
            target: [
              growthRecommendationTargets.projectId,
              growthRecommendationTargets.runId,
              growthRecommendationTargets.recommendationId,
              growthRecommendationTargets.targetType,
              growthRecommendationTargets.targetValue,
            ],
          }),
      ),
      ...input.steps.map((step) =>
        tx
          .insert(growthRecommendationSteps)
          .select(
            tx
              .select({
                projectId: growthRecommendations.projectId,
                runId: growthRecommendations.runId,
                recommendationId: growthRecommendations.id,
                position: sql<number>`${step.position}`.as("position"),
                content: sql<string>`${step.content}`.as("content"),
              })
              .from(growthRecommendations)
              .innerJoin(
                growthRuns,
                and(
                  eq(growthRuns.projectId, growthRecommendations.projectId),
                  eq(growthRuns.id, growthRecommendations.runId),
                ),
              )
              .where(parentWhere),
          )
          .onConflictDoNothing({
            target: [
              growthRecommendationSteps.projectId,
              growthRecommendationSteps.runId,
              growthRecommendationSteps.recommendationId,
              growthRecommendationSteps.position,
            ],
          }),
      ),
    ];
  });
}
