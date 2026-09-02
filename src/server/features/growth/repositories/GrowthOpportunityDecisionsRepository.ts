/* eslint-disable max-lines -- the ordered cross-provider atomic decision sequence is kept together for auditability */
import { and, eq, exists, inArray, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { getDatabaseProvider } from "@/db/provider";
import { db } from "@/db";
import { runBatch, type BatchExecutor } from "@/db/runBatch";
import {
  growthInsightSignals,
  growthInsights,
  growthRecommendationInsights,
  growthRecommendationSignalLinks,
  growthRecommendationSteps,
  growthRecommendationTargets,
  growthRecommendations,
  growthRuns,
  growthSignals,
  growthActions,
} from "@/db/schema";
import type {
  InsightWrite,
  RecommendationWrite,
} from "./GrowthInsightsGraphWriter";

function chronological(column: SQLWrapper) {
  return getDatabaseProvider() === "postgres"
    ? sql`${column}`
    : sql`strftime('%Y-%m-%dT%H:%M:%fZ', ${column})`;
}

type DecisionWrite = {
  dedupeKey: string;
  policyVersion: string;
  signalId: string;
  signalRunId: string;
  projectId: string;
  insight: InsightWrite;
  recommendation: RecommendationWrite;
  legacyController?: {
    recommendationId: string;
    signalRunId: string;
    signalId: string;
    keyPageId: string;
  } | null;
  releaseController?: {
    recommendationId: string;
    signalRunId: string;
    signalId: string;
  } | null;
};

type LegacyGraphQualification = {
  projectId: string;
  keyPageId: string;
  expectedSteps: RecommendationWrite["steps"];
  recommendationId?: string;
  signalRunId?: string;
  signalId?: string;
};

function legacyGraphGuard(tx: BatchExecutor, input: LegacyGraphQualification) {
  const directInsightOnly = sql`(SELECT count(*) FROM growth_insight_signals legacy_signal_links WHERE legacy_signal_links.project_id = growth_insights.project_id AND legacy_signal_links.run_id = growth_insights.run_id AND legacy_signal_links.insight_id = growth_insights.id) = 1`;
  const directRecommendationOnly = sql`(SELECT count(*) FROM growth_recommendation_insights legacy_recommendation_links WHERE legacy_recommendation_links.project_id = growth_recommendations.project_id AND legacy_recommendation_links.run_id = growth_recommendations.run_id AND legacy_recommendation_links.recommendation_id = growth_recommendations.id) = 1`;
  const insightRecommendationOnly = sql`(SELECT count(*) FROM growth_recommendation_insights legacy_insight_recommendations WHERE legacy_insight_recommendations.project_id = growth_insights.project_id AND legacy_insight_recommendations.run_id = growth_insights.run_id AND legacy_insight_recommendations.insight_id = growth_insights.id) = 1`;
  const exactTarget = and(
    sql`(SELECT count(*) FROM growth_recommendation_targets legacy_targets WHERE legacy_targets.project_id = growth_recommendations.project_id AND legacy_targets.run_id = growth_recommendations.run_id AND legacy_targets.recommendation_id = growth_recommendations.id) = 1`,
    exists(
      tx
        .select({ value: sql<number>`1` })
        .from(growthRecommendationTargets)
        .where(
          and(
            eq(
              growthRecommendationTargets.projectId,
              growthRecommendations.projectId,
            ),
            eq(growthRecommendationTargets.runId, growthRecommendations.runId),
            eq(
              growthRecommendationTargets.recommendationId,
              growthRecommendations.id,
            ),
            eq(growthRecommendationTargets.targetType, "url"),
          ),
        ),
    ),
  );
  const exactSteps = and(
    sql`(SELECT count(*) FROM growth_recommendation_steps legacy_steps WHERE legacy_steps.project_id = growth_recommendations.project_id AND legacy_steps.run_id = growth_recommendations.run_id AND legacy_steps.recommendation_id = growth_recommendations.id) = ${input.expectedSteps.length}`,
    ...input.expectedSteps.map((step) =>
      exists(
        tx
          .select({ value: sql<number>`1` })
          .from(growthRecommendationSteps)
          .where(
            and(
              eq(
                growthRecommendationSteps.projectId,
                growthRecommendations.projectId,
              ),
              eq(growthRecommendationSteps.runId, growthRecommendations.runId),
              eq(
                growthRecommendationSteps.recommendationId,
                growthRecommendations.id,
              ),
              eq(growthRecommendationSteps.position, step.position),
              eq(growthRecommendationSteps.content, step.content),
            ),
          ),
      ),
    ),
  );
  return and(
    eq(growthRecommendations.projectId, input.projectId),
    eq(growthRecommendations.category, "investigation"),
    eq(growthRuns.runType, "manual_analysis"),
    sql`${growthRuns.cadenceSlot} LIKE 'priority-page-check:%'`,
    eq(growthRuns.detectorVersion, "priority-page-click-decline-v1"),
    eq(growthRuns.analysisVersion, "priority-page-investigation-v1"),
    sql`${growthRuns.status} IN ('completed', 'completed_with_errors')`,
    eq(growthSignals.signalType, "priority_page_click_decline"),
    eq(growthSignals.entityType, "key_page"),
    eq(growthSignals.entityRef, input.keyPageId),
    eq(growthSignals.metric, "gsc_clicks"),
    eq(growthSignals.evidenceKind, "gsc_period"),
    sql`${growthInsights.creationKey} = 'priority-page-investigation-v1:insight:' || ${growthSignals.id}`,
    sql`${growthRecommendations.creationKey} = 'priority-page-investigation-v1:recommendation:' || ${growthSignals.id}`,
    directInsightOnly,
    directRecommendationOnly,
    insightRecommendationOnly,
    exactTarget,
    exactSteps,
    input.recommendationId
      ? eq(growthRecommendations.id, input.recommendationId)
      : undefined,
    input.signalRunId ? eq(growthSignals.runId, input.signalRunId) : undefined,
    input.signalId ? eq(growthSignals.id, input.signalId) : undefined,
  );
}

function qualifiedLegacyExists(tx: BatchExecutor, input: DecisionWrite) {
  if (!input.legacyController) return null;
  return exists(
    tx
      .select({ value: sql<number>`1` })
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
        growthInsights,
        and(
          eq(growthInsights.projectId, growthRecommendationInsights.projectId),
          eq(growthInsights.runId, growthRecommendationInsights.runId),
          eq(growthInsights.id, growthRecommendationInsights.insightId),
        ),
      )
      .innerJoin(
        growthInsightSignals,
        and(
          eq(growthInsightSignals.projectId, growthInsights.projectId),
          eq(growthInsightSignals.runId, growthInsights.runId),
          eq(growthInsightSignals.insightId, growthInsights.id),
        ),
      )
      .innerJoin(
        growthSignals,
        and(
          eq(growthSignals.projectId, growthInsightSignals.projectId),
          eq(growthSignals.runId, growthInsightSignals.runId),
          eq(growthSignals.id, growthInsightSignals.signalId),
        ),
      )
      .innerJoin(
        growthRuns,
        and(
          eq(growthRuns.projectId, growthSignals.projectId),
          eq(growthRuns.id, growthSignals.runId),
        ),
      )
      .where(
        legacyGraphGuard(tx, {
          projectId: input.projectId,
          keyPageId: input.legacyController.keyPageId,
          expectedSteps: input.recommendation.steps,
          recommendationId: input.legacyController.recommendationId,
          signalRunId: input.legacyController.signalRunId,
          signalId: input.legacyController.signalId,
        }),
      ),
  );
}

const activeController = (tx: BatchExecutor, input: DecisionWrite) =>
  exists(
    tx
      .select({ value: sql<number>`1` })
      .from(growthRecommendationSignalLinks)
      .where(
        and(
          eq(growthRecommendationSignalLinks.projectId, input.projectId),
          eq(growthRecommendationSignalLinks.dedupeKey, input.dedupeKey),
          eq(growthRecommendationSignalLinks.relationship, "controller"),
          sql`${growthRecommendationSignalLinks.controllerReleasedAt} IS NULL`,
        ),
      ),
  );

function runningSignalSource(
  tx: BatchExecutor,
  input: DecisionWrite,
  fields: { projectId: typeof growthSignals.projectId },
  guard?: ReturnType<typeof sql>,
) {
  return tx
    .select(fields)
    .from(growthSignals)
    .innerJoin(
      growthRuns,
      and(
        eq(growthRuns.projectId, growthSignals.projectId),
        eq(growthRuns.id, growthSignals.runId),
      ),
    )
    .where(
      and(
        eq(growthSignals.projectId, input.projectId),
        eq(growthSignals.runId, input.signalRunId),
        eq(growthSignals.id, input.signalId),
        eq(growthRuns.status, "running"),
        guard,
      ),
    );
}

function exactControllerActionReleasable(
  tx: BatchExecutor,
  input: DecisionWrite,
  controller: NonNullable<DecisionWrite["releaseController"]>,
) {
  const candidateCapturedAt = sql`(SELECT captured_at FROM growth_signals candidate_signal WHERE candidate_signal.project_id = ${input.projectId} AND candidate_signal.run_id = ${input.signalRunId} AND candidate_signal.id = ${input.signalId})`;
  const strictlyAfterEvaluation =
    getDatabaseProvider() === "postgres"
      ? sql`CASE WHEN pg_input_is_valid(${candidateCapturedAt}, 'timestamp with time zone') AND pg_input_is_valid(${growthActions.evaluatedAt}, 'timestamp with time zone') THEN (${candidateCapturedAt})::timestamptz > (${growthActions.evaluatedAt})::timestamptz ELSE FALSE END`
      : sql`julianday(${candidateCapturedAt}) IS NOT NULL AND julianday(${growthActions.evaluatedAt}) IS NOT NULL AND julianday(${candidateCapturedAt}) > julianday(${growthActions.evaluatedAt})`;
  return exists(
    tx
      .select({ value: sql<number>`1` })
      .from(growthActions)
      .where(
        and(
          eq(growthActions.projectId, input.projectId),
          eq(growthActions.recommendationId, controller.recommendationId),
          eq(
            growthActions.creationKey,
            `priority-page-investigation-v1:action:${controller.signalId}`,
          ),
          eq(growthActions.status, "evaluated"),
          sql`${growthActions.evaluatedAt} IS NOT NULL`,
          strictlyAfterEvaluation,
        ),
      ),
  );
}

/**
 * Persist a candidate graph and its controller claim in one ordered atomic
 * batch. A competing candidate has deterministic parent ids, so it cannot
 * leave graph children behind after another transaction wins the claim.
 */
// eslint-disable-next-line max-lines-per-function -- splitting the ordered batch obscures its atomic write order
async function writeDecision(input: DecisionWrite) {
  const createdAt = new Date().toISOString();
  // eslint-disable-next-line max-lines-per-function -- the callback is the ordered cross-provider atomic batch
  await runBatch((tx) => {
    // This must run before the conditional release. On PostgreSQL the share
    // lock holds the accepted running source through the transaction, so a
    // terminal Run transition cannot leave a released controller without its
    // successor. D1 executes the equivalent running-state read first in the
    // ordered atomic batch.
    const candidateSource = runningSignalSource(tx, input, {
      projectId: growthSignals.projectId,
    });
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the provider guard proves this narrower Postgres builder surface
    const postgresCandidateSource = candidateSource as unknown as {
      for: (strength: "share") => typeof candidateSource;
    };
    const lockedCandidateSource =
      getDatabaseProvider() === "postgres"
        ? postgresCandidateSource.for("share")
        : candidateSource;
    const releaseController = input.releaseController
      ? tx
          .update(growthRecommendationSignalLinks)
          .set({ controllerReleasedAt: createdAt })
          .where(
            and(
              eq(growthRecommendationSignalLinks.projectId, input.projectId),
              eq(growthRecommendationSignalLinks.dedupeKey, input.dedupeKey),
              eq(growthRecommendationSignalLinks.relationship, "controller"),
              eq(
                growthRecommendationSignalLinks.recommendationId,
                input.releaseController.recommendationId,
              ),
              eq(
                growthRecommendationSignalLinks.signalRunId,
                input.releaseController.signalRunId,
              ),
              eq(
                growthRecommendationSignalLinks.signalId,
                input.releaseController.signalId,
              ),
              sql`${growthRecommendationSignalLinks.controllerReleasedAt} IS NULL`,
              exists(
                runningSignalSource(tx, input, {
                  projectId: growthSignals.projectId,
                }),
              ),
              exactControllerActionReleasable(
                tx,
                input,
                input.releaseController,
              ),
            ),
          )
      : null;
    const noController = sql`NOT ${activeController(tx, input)}`;
    const releaseMarker = input.releaseController
      ? exists(
          tx
            .select({ value: sql<number>`1` })
            .from(growthRecommendationSignalLinks)
            .where(
              and(
                eq(growthRecommendationSignalLinks.projectId, input.projectId),
                eq(growthRecommendationSignalLinks.dedupeKey, input.dedupeKey),
                eq(growthRecommendationSignalLinks.relationship, "controller"),
                eq(
                  growthRecommendationSignalLinks.recommendationId,
                  input.releaseController.recommendationId,
                ),
                eq(
                  growthRecommendationSignalLinks.signalRunId,
                  input.releaseController.signalRunId,
                ),
                eq(
                  growthRecommendationSignalLinks.signalId,
                  input.releaseController.signalId,
                ),
                eq(
                  growthRecommendationSignalLinks.controllerReleasedAt,
                  createdAt,
                ),
              ),
            ),
        )
      : null;
    const legacyEligible = qualifiedLegacyExists(tx, input);
    const canCreateCandidate = releaseMarker
      ? sql`${releaseMarker} AND ${noController}`
      : legacyEligible
        ? sql`${noController} AND NOT ${legacyEligible}`
        : noController;
    const source = tx
      .select({
        id: sql<string>`${input.insight.id}`.as("id"),
        projectId: sql<string>`${input.projectId}`.as("project_id"),
        runId: sql<string>`${input.insight.runId}`.as("run_id"),
        creationKey: sql<string>`${input.insight.creationKey}`.as(
          "creation_key",
        ),
        factHash: sql<string>`${input.insight.factHash}`.as("fact_hash"),
        title: sql<string>`${input.insight.title}`.as("title"),
        explanation: sql<string>`${input.insight.explanation}`.as(
          "explanation",
        ),
        hypothesis: sql<string>`${input.insight.hypothesis}`.as("hypothesis"),
        confidence: sql<number>`${input.insight.confidence}`.as("confidence"),
        model: sql<string | null>`${input.insight.model}`.as("model"),
        promptVersion: sql<string | null>`${input.insight.promptVersion}`.as(
          "prompt_version",
        ),
        createdAt: sql<string>`${createdAt}`.as("created_at"),
      })
      .from(growthSignals)
      .innerJoin(
        growthRuns,
        and(
          eq(growthRuns.projectId, growthSignals.projectId),
          eq(growthRuns.id, growthSignals.runId),
        ),
      )
      .where(
        and(
          eq(growthSignals.projectId, input.projectId),
          eq(growthSignals.runId, input.signalRunId),
          eq(growthSignals.id, input.signalId),
          eq(growthRuns.status, "running"),
          canCreateCandidate,
        ),
      );
    // Hold the accepted running state through the complete PostgreSQL
    // transaction. Without this lock, a terminal update could land between
    // candidate graph insertion and the controller claim.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the provider guard proves this narrower Postgres builder surface
    const postgresSource = source as unknown as {
      for: (strength: "share") => typeof source;
    };
    const lockedSource =
      getDatabaseProvider() === "postgres"
        ? postgresSource.for("share")
        : source;
    const insight = tx
      .insert(growthInsights)
      .select(lockedSource)
      .onConflictDoNothing();
    const insightWhere = and(
      eq(growthInsights.projectId, input.projectId),
      eq(growthInsights.runId, input.insight.runId),
      eq(growthInsights.id, input.insight.id),
      eq(growthInsights.factHash, input.insight.factHash),
    );
    const insightSignal = tx
      .insert(growthInsightSignals)
      .select(
        tx
          .select({
            projectId: growthInsights.projectId,
            runId: growthInsights.runId,
            insightId: growthInsights.id,
            signalId: sql<string>`${input.signalId}`.as("signal_id"),
          })
          .from(growthInsights)
          .where(insightWhere),
      )
      .onConflictDoNothing();
    const recommendation = tx
      .insert(growthRecommendations)
      .select(
        tx
          .select({
            id: sql<string>`${input.recommendation.id}`.as("id"),
            projectId: growthInsights.projectId,
            runId: growthInsights.runId,
            creationKey: sql<string>`${input.recommendation.creationKey}`.as(
              "creation_key",
            ),
            factHash: sql<string>`${input.recommendation.factHash}`.as(
              "fact_hash",
            ),
            title: sql<string>`${input.recommendation.title}`.as("title"),
            rationale: sql<string>`${input.recommendation.rationale}`.as(
              "rationale",
            ),
            category: sql<string>`${input.recommendation.category}`.as(
              "category",
            ),
            impact: sql<number>`${input.recommendation.impact}`.as("impact"),
            commercialRelevance:
              sql<number>`${input.recommendation.commercialRelevance}`.as(
                "commercial_relevance",
              ),
            effort: sql<number>`${input.recommendation.effort}`.as("effort"),
            urgency: sql<number>`${input.recommendation.urgency}`.as("urgency"),
            confidence: sql<number>`${input.recommendation.confidence}`.as(
              "confidence",
            ),
            priorityScore:
              sql<number>`${input.recommendation.priorityScore}`.as(
                "priority_score",
              ),
            model: sql<string | null>`${input.recommendation.model}`.as(
              "model",
            ),
            promptVersion: sql<
              string | null
            >`${input.recommendation.promptVersion}`.as("prompt_version"),
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
          .from(growthInsights)
          .where(insightWhere),
      )
      .onConflictDoNothing();
    const recommendationWhere = and(
      eq(growthRecommendations.projectId, input.projectId),
      eq(growthRecommendations.runId, input.recommendation.runId),
      eq(growthRecommendations.id, input.recommendation.id),
      eq(growthRecommendations.factHash, input.recommendation.factHash),
    );
    const recommendationInsight = tx
      .insert(growthRecommendationInsights)
      .select(
        tx
          .select({
            projectId: growthRecommendations.projectId,
            runId: growthRecommendations.runId,
            recommendationId: growthRecommendations.id,
            insightId: growthInsights.id,
          })
          .from(growthRecommendations)
          .innerJoin(
            growthInsights,
            and(
              eq(growthInsights.projectId, growthRecommendations.projectId),
              eq(growthInsights.runId, growthRecommendations.runId),
              eq(growthInsights.id, input.insight.id),
            ),
          )
          .where(recommendationWhere),
      )
      .onConflictDoNothing();
    const targets = input.recommendation.targets.map((target) =>
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
            .where(recommendationWhere),
        )
        .onConflictDoNothing(),
    );
    const steps = input.recommendation.steps.map((step) =>
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
            .where(recommendationWhere),
        )
        .onConflictDoNothing(),
    );
    const controller = tx
      .insert(growthRecommendationSignalLinks)
      .select(
        tx
          .select({
            projectId: growthRecommendations.projectId,
            signalRunId: sql<string>`${input.signalRunId}`.as("signal_run_id"),
            signalId: sql<string>`${input.signalId}`.as("signal_id"),
            dedupeKey: sql<string>`${input.dedupeKey}`.as("dedupe_key"),
            recommendationId: growthRecommendations.id,
            relationship: sql<"controller">`'controller'`.as("relationship"),
            suppressionReason: sql<null>`NULL`.as("suppression_reason"),
            policyVersion: sql<string>`${input.policyVersion}`.as(
              "policy_version",
            ),
            controllerReleasedAt: sql<null>`NULL`.as("controller_released_at"),
            createdAt: sql<string>`${createdAt}`.as("created_at"),
          })
          .from(growthRecommendations)
          .where(
            and(
              recommendationWhere,
              canCreateCandidate,
              exists(
                runningSignalSource(tx, input, {
                  projectId: growthSignals.projectId,
                }),
              ),
            ),
          ),
      )
      .onConflictDoNothing();
    const legacyCandidate = input.legacyController;
    const legacyController = legacyCandidate
      ? tx
          .insert(growthRecommendationSignalLinks)
          .select(
            tx
              .select({
                projectId: growthRecommendations.projectId,
                signalRunId: sql<string>`${legacyCandidate.signalRunId}`.as(
                  "signal_run_id",
                ),
                signalId: sql<string>`${legacyCandidate.signalId}`.as(
                  "signal_id",
                ),
                dedupeKey: sql<string>`${input.dedupeKey}`.as("dedupe_key"),
                recommendationId: growthRecommendations.id,
                relationship: sql<"controller">`'controller'`.as(
                  "relationship",
                ),
                suppressionReason: sql<null>`NULL`.as("suppression_reason"),
                policyVersion: sql<string>`${input.policyVersion}`.as(
                  "policy_version",
                ),
                controllerReleasedAt: sql<null>`NULL`.as(
                  "controller_released_at",
                ),
                createdAt: sql<string>`${createdAt}`.as("created_at"),
              })
              .from(growthRecommendations)
              .innerJoin(
                growthRecommendationInsights,
                and(
                  eq(
                    growthRecommendationInsights.projectId,
                    growthRecommendations.projectId,
                  ),
                  eq(
                    growthRecommendationInsights.runId,
                    growthRecommendations.runId,
                  ),
                  eq(
                    growthRecommendationInsights.recommendationId,
                    growthRecommendations.id,
                  ),
                ),
              )
              .innerJoin(
                growthInsights,
                and(
                  eq(
                    growthInsights.projectId,
                    growthRecommendationInsights.projectId,
                  ),
                  eq(growthInsights.runId, growthRecommendationInsights.runId),
                  eq(growthInsights.id, growthRecommendationInsights.insightId),
                ),
              )
              .innerJoin(
                growthInsightSignals,
                and(
                  eq(growthInsightSignals.projectId, growthInsights.projectId),
                  eq(growthInsightSignals.runId, growthInsights.runId),
                  eq(growthInsightSignals.insightId, growthInsights.id),
                ),
              )
              .innerJoin(
                growthSignals,
                and(
                  eq(growthSignals.projectId, growthInsightSignals.projectId),
                  eq(growthSignals.runId, growthInsightSignals.runId),
                  eq(growthSignals.id, growthInsightSignals.signalId),
                ),
              )
              .innerJoin(
                growthRuns,
                and(
                  eq(growthRuns.projectId, growthSignals.projectId),
                  eq(growthRuns.id, growthSignals.runId),
                ),
              )
              .where(
                and(
                  legacyGraphGuard(tx, {
                    projectId: input.projectId,
                    keyPageId: legacyCandidate.keyPageId,
                    expectedSteps: input.recommendation.steps,
                    recommendationId: legacyCandidate.recommendationId,
                    signalRunId: legacyCandidate.signalRunId,
                    signalId: legacyCandidate.signalId,
                  }),
                  noController,
                  exists(
                    runningSignalSource(tx, input, {
                      projectId: growthSignals.projectId,
                    }),
                  ),
                ),
              ),
          )
          .onConflictDoNothing()
      : null;
    const suppressed = tx
      .insert(growthRecommendationSignalLinks)
      .select(
        tx
          .select({
            projectId: growthRecommendationSignalLinks.projectId,
            signalRunId: sql<string>`${input.signalRunId}`.as("signal_run_id"),
            signalId: sql<string>`${input.signalId}`.as("signal_id"),
            dedupeKey: growthRecommendationSignalLinks.dedupeKey,
            recommendationId: growthRecommendationSignalLinks.recommendationId,
            relationship: sql<"suppressed">`'suppressed'`.as("relationship"),
            suppressionReason: sql<
              | "existing_proposal"
              | "existing_snooze"
              | "prior_dismissal"
              | "existing_action"
              | "accepted_without_action"
              | "resolved_recommendation"
            >`CASE WHEN ${growthRecommendations.status} = 'snoozed' THEN 'existing_snooze' WHEN ${growthRecommendations.status} = 'dismissed' THEN 'prior_dismissal' WHEN ${growthRecommendations.status} IN ('merged', 'superseded') THEN 'resolved_recommendation' WHEN ${growthRecommendations.status} = 'accepted' AND EXISTS (SELECT 1 FROM growth_actions WHERE growth_actions.project_id = growth_recommendations.project_id AND growth_actions.recommendation_id = growth_recommendations.id AND growth_actions.creation_key = 'priority-page-investigation-v1:action:' || ${growthRecommendationSignalLinks.signalId}) THEN 'existing_action' WHEN ${growthRecommendations.status} = 'accepted' THEN 'accepted_without_action' ELSE 'existing_proposal' END`.as(
              "suppression_reason",
            ),
            policyVersion: sql<string>`${input.policyVersion}`.as(
              "policy_version",
            ),
            controllerReleasedAt: sql<null>`NULL`.as("controller_released_at"),
            createdAt: sql<string>`${createdAt}`.as("created_at"),
          })
          .from(growthRecommendationSignalLinks)
          .innerJoin(
            growthRecommendations,
            and(
              eq(
                growthRecommendations.projectId,
                growthRecommendationSignalLinks.projectId,
              ),
              eq(
                growthRecommendations.id,
                growthRecommendationSignalLinks.recommendationId,
              ),
            ),
          )
          .where(
            and(
              eq(growthRecommendationSignalLinks.projectId, input.projectId),
              eq(growthRecommendationSignalLinks.dedupeKey, input.dedupeKey),
              eq(growthRecommendationSignalLinks.relationship, "controller"),
              sql`${growthRecommendationSignalLinks.controllerReleasedAt} IS NULL`,
              exists(
                runningSignalSource(tx, input, {
                  projectId: growthSignals.projectId,
                }),
              ),
            ),
          ),
      )
      .onConflictDoNothing();
    return [
      lockedCandidateSource,
      ...(releaseController ? [releaseController] : []),
      insight,
      insightSignal,
      recommendation,
      recommendationInsight,
      ...targets,
      ...steps,
      controller,
      ...(legacyController ? [legacyController] : []),
      suppressed,
    ];
  });
}

async function findLegacyPriorityPageController(
  projectId: string,
  keyPageId: string,
  expectedSteps: RecommendationWrite["steps"],
) {
  const actionKey = "priority-page-investigation-v1:action:";
  const actionExists = sql`EXISTS (SELECT 1 FROM growth_actions WHERE growth_actions.project_id = growth_recommendations.project_id AND growth_actions.recommendation_id = growth_recommendations.id AND growth_actions.creation_key = ${actionKey} || growth_signals.id)`;
  const statusOrder = sql`CASE WHEN growth_recommendations.status = 'accepted' AND ${actionExists} THEN 0 WHEN growth_recommendations.status = 'snoozed' THEN 1 WHEN growth_recommendations.status = 'proposed' THEN 2 WHEN growth_recommendations.status = 'accepted' THEN 3 WHEN growth_recommendations.status = 'dismissed' THEN 4 ELSE 5 END`;
  const idOrder =
    getDatabaseProvider() === "postgres"
      ? sql`${growthRecommendations.id} COLLATE "C"`
      : sql`${growthRecommendations.id} COLLATE BINARY`;
  const createdAtOrder = chronological(growthRecommendations.createdAt);
  const rows = await db
    .select({
      recommendationId: growthRecommendations.id,
      signalRunId: growthSignals.runId,
      signalId: growthSignals.id,
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
      growthInsights,
      and(
        eq(growthInsights.projectId, growthRecommendationInsights.projectId),
        eq(growthInsights.runId, growthRecommendationInsights.runId),
        eq(growthInsights.id, growthRecommendationInsights.insightId),
      ),
    )
    .innerJoin(
      growthInsightSignals,
      and(
        eq(growthInsightSignals.projectId, growthInsights.projectId),
        eq(growthInsightSignals.runId, growthInsights.runId),
        eq(growthInsightSignals.insightId, growthInsights.id),
      ),
    )
    .innerJoin(
      growthSignals,
      and(
        eq(growthSignals.projectId, growthInsightSignals.projectId),
        eq(growthSignals.runId, growthInsightSignals.runId),
        eq(growthSignals.id, growthInsightSignals.signalId),
      ),
    )
    .innerJoin(
      growthRuns,
      and(
        eq(growthRuns.projectId, growthSignals.projectId),
        eq(growthRuns.id, growthSignals.runId),
      ),
    )
    .where(legacyGraphGuard(db, { projectId, keyPageId, expectedSteps }))
    .orderBy(statusOrder, createdAtOrder, idOrder)
    .limit(1);
  return rows[0] ?? null;
}

async function getSignalDecision(
  projectId: string,
  signalRunId: string,
  signalId: string,
) {
  const [row] = await db
    .select()
    .from(growthRecommendationSignalLinks)
    .where(
      and(
        eq(growthRecommendationSignalLinks.projectId, projectId),
        eq(growthRecommendationSignalLinks.signalRunId, signalRunId),
        eq(growthRecommendationSignalLinks.signalId, signalId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * A bounded read used solely to choose deterministic ids for a possible next
 * controller cycle. The later write rechecks all of these facts atomically.
 */
async function getActiveControllerReleasePreflight(
  projectId: string,
  dedupeKey: string,
  signalRunId: string,
  signalId: string,
) {
  const [controller, candidate] = await Promise.all([
    db
      .select({
        recommendationId: growthRecommendationSignalLinks.recommendationId,
        signalRunId: growthRecommendationSignalLinks.signalRunId,
        signalId: growthRecommendationSignalLinks.signalId,
        actionStatus: growthActions.status,
        evaluatedAt: growthActions.evaluatedAt,
      })
      .from(growthRecommendationSignalLinks)
      .leftJoin(
        growthActions,
        and(
          eq(
            growthActions.projectId,
            growthRecommendationSignalLinks.projectId,
          ),
          eq(
            growthActions.recommendationId,
            growthRecommendationSignalLinks.recommendationId,
          ),
          sql`${growthActions.creationKey} = 'priority-page-investigation-v1:action:' || ${growthRecommendationSignalLinks.signalId}`,
        ),
      )
      .where(
        and(
          eq(growthRecommendationSignalLinks.projectId, projectId),
          eq(growthRecommendationSignalLinks.dedupeKey, dedupeKey),
          eq(growthRecommendationSignalLinks.relationship, "controller"),
          sql`${growthRecommendationSignalLinks.controllerReleasedAt} IS NULL`,
        ),
      )
      .limit(1),
    db
      .select({ capturedAt: growthSignals.capturedAt })
      .from(growthSignals)
      .innerJoin(
        growthRuns,
        and(
          eq(growthRuns.projectId, growthSignals.projectId),
          eq(growthRuns.id, growthSignals.runId),
        ),
      )
      .where(
        and(
          eq(growthSignals.projectId, projectId),
          eq(growthSignals.runId, signalRunId),
          eq(growthSignals.id, signalId),
          eq(growthRuns.status, "running"),
        ),
      )
      .limit(1),
  ]);
  const current = controller[0];
  const signal = candidate[0];
  if (!current || !signal) return null;
  return {
    recommendationId: current.recommendationId,
    signalRunId: current.signalRunId,
    signalId: current.signalId,
    capturedAt: signal.capturedAt,
    actionStatus: current.actionStatus,
    evaluatedAt: current.evaluatedAt,
  };
}

async function getDecisionControllerSource(
  projectId: string,
  signalRunId: string,
  signalId: string,
) {
  const decision = await getSignalDecision(projectId, signalRunId, signalId);
  if (!decision) return null;
  const [controller] = await db
    .select({
      controllerRunId: growthRecommendationSignalLinks.signalRunId,
      controllerSignalId: growthRecommendationSignalLinks.signalId,
    })
    .from(growthRecommendationSignalLinks)
    .where(
      and(
        eq(growthRecommendationSignalLinks.projectId, projectId),
        eq(
          growthRecommendationSignalLinks.recommendationId,
          decision.recommendationId,
        ),
        eq(growthRecommendationSignalLinks.relationship, "controller"),
      ),
    )
    .limit(1);
  if (!controller) return null;
  return {
    relationship: decision.relationship,
    recommendationId: decision.recommendationId,
    suppressionReason: decision.suppressionReason,
    policyVersion: decision.policyVersion,
    controllerReleasedAt: decision.controllerReleasedAt,
    ...controller,
  };
}

/**
 * Returns controller Signal IDs only for the current, unreleased decision
 * records. The caller has already bounded recommendationIds to one emitted
 * project page; this read intentionally does not infer or adopt old graphs.
 */
async function listActiveControllerSources(
  projectId: string,
  recommendationIds: string[],
) {
  if (recommendationIds.length === 0) return [];
  const rows = await db
    .select({
      recommendationId: growthRecommendationSignalLinks.recommendationId,
      signalId: growthRecommendationSignalLinks.signalId,
    })
    .from(growthRecommendationSignalLinks)
    .where(
      and(
        eq(growthRecommendationSignalLinks.projectId, projectId),
        inArray(
          growthRecommendationSignalLinks.recommendationId,
          recommendationIds,
        ),
        eq(growthRecommendationSignalLinks.relationship, "controller"),
        sql`${growthRecommendationSignalLinks.controllerReleasedAt} IS NULL`,
      ),
    );
  return rows;
}

export const GrowthOpportunityDecisionsRepository = {
  writeDecision,
  getActiveControllerReleasePreflight,
  getSignalDecision,
  getDecisionControllerSource,
  listActiveControllerSources,
  findLegacyPriorityPageController,
} as const;
