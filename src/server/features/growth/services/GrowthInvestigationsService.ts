/* eslint-disable max-lines -- investigation review and its existing Work coordination remain one service boundary */
import { AppError } from "@/server/lib/errors";
import type {
  GrowthInvestigationReviewInput,
  GrowthInvestigationView,
  GrowthWorkItem,
  GrowthWorkOverview,
} from "@/types/schemas/growth-investigations";
import { growthInvestigationViewSchema } from "@/types/schemas/growth-investigations";
import type {
  GrowthWorkHistory,
  UpdateGrowthWorkStatusInput,
} from "@/types/schemas/growth-work";
import { GrowthActionsRepository } from "../repositories/GrowthActionsRepository";
import { GrowthInsightsRepository } from "../repositories/GrowthInsightsRepository";
import { GrowthOpportunityDecisionsRepository } from "../repositories/GrowthOpportunityDecisionsRepository";
import { GrowthRunsRepository } from "../repositories/GrowthRunsRepository";
import { normalizeKeyPageUrl } from "@/server/features/project-context/services/contextUpdateOps";
import { GrowthActionsService } from "./GrowthActionsService";
import { GrowthInsightsService } from "./GrowthInsightsService";
import { investigationKeys } from "./GrowthInvestigationTemplate";
import { growthEvidenceDisplayUrl } from "./GrowthEvidencePacket";
import { canonicalTimestamp } from "./GrowthMeasurementFacts";
import {
  descriptorForRunAndController,
  investigationKeysForDescriptor,
  priorityPageInvestigationDescriptor,
  type GrowthInvestigationTemplateDescriptor,
} from "./GrowthInvestigationTemplateDescriptor";
import { matchesStrikingDistanceEvidenceRef } from "./StrikingDistanceQueryDetector";
import { matchesLowCtrEvidenceRef } from "./HighImpressionLowCtrDetector";
import {
  parsePersistentRankDropEvidenceRef,
  PERSISTENT_RANK_DROP_POLICY,
} from "./PersistentTrackedRankDropDetector";
import type { GrowthTargetNormalizationMode } from "./GrowthTargetNormalizer";

const WORK_LIMIT = 50;

function dueOn(dueAt: string | null) {
  return dueAt?.slice(0, 10) ?? null;
}

function displayUrls(targets: { targetType: string; targetValue: string }[]) {
  return targets
    .filter((target) => target.targetType === "url")
    .map(
      (target) => growthEvidenceDisplayUrl(target.targetValue).value ?? null,
    );
}

function canonicalReviewTimestamp(value: string | null) {
  if (value === null) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return canonicalTimestamp(normalized, "Recommendation snooze timestamp");
}

function canonicalRankTimestamp(value: string, label: string) {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return canonicalTimestamp(normalized, label);
}

function preceding28DayPeriod(currentStart: string) {
  const current = new Date(`${currentStart}T00:00:00.000Z`);
  if (Number.isNaN(current.valueOf())) return null;
  const end = new Date(current);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

async function source(projectId: string, signalId: string) {
  const signal = await GrowthRunsRepository.getSignal(projectId, signalId);
  if (!signal) throw new AppError("NOT_FOUND", "Growth Signal not found");
  const run = await GrowthRunsRepository.getRun(projectId, signal.runId);
  const descriptor = run
    ? descriptorForRunAndController({ run, signal })
    : null;
  if (!descriptor)
    throw new AppError("NOT_FOUND", "Growth investigation source not found");
  return { signal, run, descriptor };
}

type RecommendationGraph = NonNullable<
  Awaited<ReturnType<typeof GrowthInsightsService.getRecommendation>>
>;
type InsightGraph = NonNullable<
  Awaited<ReturnType<typeof GrowthInsightsService.getInsight>>
>;

async function qualifiedPersistentRankDropGraph(
  projectId: string,
  signalId: string,
  graph: RecommendationGraph,
  insight: InsightGraph,
) {
  const { RankTrackingRepository } =
    await import("@/server/features/rank-tracking/repositories/RankTrackingRepository");
  const { getSnapshotsByIds } =
    await import("@/server/features/rank-tracking/repositories/snapshotQueries");
  if (insight.signalIds.length !== 1 || insight.signalIds[0] !== signalId)
    return null;
  const controller = await GrowthRunsRepository.getSignal(projectId, signalId);
  const evidenceRef = controller
    ? parsePersistentRankDropEvidenceRef(controller.evidenceRef)
    : null;
  if (!controller || !evidenceRef) return null;
  const snapshots = await getSnapshotsByIds(evidenceRef.snapshotIds);
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const ordered = evidenceRef.snapshotIds.map((id) => byId.get(id));
  if (ordered.some((snapshot) => !snapshot)) return null;
  const rows = ordered.filter(
    (snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot),
  );
  const runs = await Promise.all(
    rows.map((snapshot) => RankTrackingRepository.getRunById(snapshot.runId)),
  );
  if (runs.some((rankRun) => !rankRun)) return null;
  const rankRuns = runs.filter(
    (rankRun): rankRun is NonNullable<typeof rankRun> => Boolean(rankRun),
  );
  const configId = rankRuns[0]?.configId;
  const config = configId
    ? await RankTrackingRepository.getConfigById({ configId, projectId })
    : null;
  const keyword = graph.targets.find(
    (target) => target.targetType === "keyword",
  );
  const page = graph.targets.find((target) => target.targetType === "url");
  const site = graph.targets.find((target) => target.targetType === "site");
  const targetKinds = new Set(graph.targets.map((target) => target.targetType));
  const device = rows[0]?.device;
  const baseline = rows[0]?.position;
  const normalizedKeyword = keyword?.targetValue
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  let baselineUrl: string | null = null;
  try {
    baselineUrl = rows[0]?.url ? normalizeKeyPageUrl(rows[0].url) : null;
  } catch {
    return null;
  }
  if (
    !config ||
    !keyword ||
    !page ||
    !site ||
    graph.targets.length !== 3 ||
    !targetKinds.has("keyword") ||
    !targetKinds.has("url") ||
    !targetKinds.has("site") ||
    !device ||
    baseline === null ||
    baselineUrl !== page.targetValue ||
    rows.some(
      (snapshot) =>
        (snapshot.position !== null &&
          (!Number.isInteger(snapshot.position) ||
            snapshot.position < 1 ||
            snapshot.position > evidenceRef.serpDepth)) ||
        snapshot.trackingKeywordId !== controller.entityRef ||
        snapshot.device !== device ||
        snapshot.keyword.trim().replace(/\s+/g, " ").toLowerCase() !==
          normalizedKeyword,
    ) ||
    rankRuns.some(
      (rankRun, index) =>
        rankRun.id !== rows[index].runId ||
        rankRun.projectId !== projectId ||
        rankRun.configId !== config.id ||
        rankRun.status !== "completed" ||
        rankRun.isSubsetRun,
    ) ||
    rankRuns.some(
      (rankRun, index) =>
        index > 0 && rankRuns[index - 1].startedAt > rankRun.startedAt,
    )
  )
    return null;
  const floors = rows
    .slice(1)
    .map((snapshot) => snapshot.position ?? evidenceRef.serpDepth + 1);
  const latest = floors.at(-1);
  const periodStart = canonicalRankTimestamp(
    rankRuns[0].startedAt,
    "Rank baseline timestamp",
  ).slice(0, 10);
  const periodEnd = canonicalRankTimestamp(
    rankRuns.at(-1)!.startedAt,
    "Latest rank timestamp",
  ).slice(0, 10);
  if (
    latest === undefined ||
    floors.some(
      (position) =>
        position - baseline < PERSISTENT_RANK_DROP_POLICY.minimumPositionLoss,
    ) ||
    controller.baselineValue !== baseline ||
    controller.currentValue !== latest ||
    controller.deltaValue !== latest - baseline ||
    controller.periodStart !== periodStart ||
    controller.periodEnd !== periodEnd
  )
    return null;
  return {
    graph,
    evidence: {
      kind: "persistent_tracked_rank_drop" as const,
      keyword: keyword.targetValue,
      device,
      page: page.targetValue,
      site: site.targetValue,
      serpDepth: evidenceRef.serpDepth,
      checks: rankRuns.map((rankRun, index) => ({
        checkedAt: canonicalRankTimestamp(
          rankRun.startedAt,
          "Rank check timestamp",
        ),
        position: rows[index].position,
      })),
    },
  };
}

async function qualifiedGraph(
  projectId: string,
  runId: string,
  signalId: string,
  recommendationId: string,
  descriptor: GrowthInvestigationTemplateDescriptor,
) {
  const keys = investigationKeysForDescriptor(descriptor, signalId);
  const graph = await GrowthInsightsService.getRecommendation(
    projectId,
    runId,
    recommendationId,
  );
  if (
    !graph ||
    graph.recommendation.creationKey !== keys.recommendation ||
    graph.recommendation.category !== "investigation" ||
    graph.insightIds.length !== 1
  )
    return null;
  const insight = await GrowthInsightsService.getInsight(
    projectId,
    runId,
    graph.insightIds[0],
  );
  if (
    !insight ||
    insight.insight.creationKey !== keys.insight ||
    (descriptor.family === "priority_page" &&
      (insight.signalIds.length !== 1 || insight.signalIds[0] !== signalId))
  )
    return null;
  if (descriptor.family === "priority_page") return { graph, evidence: null };

  if (descriptor.family === "persistent_rank_drop")
    return qualifiedPersistentRankDropGraph(
      projectId,
      signalId,
      graph,
      insight,
    );
  const expectedFactCount = 1 + descriptor.companionMetrics.length;
  if (
    insight.signalIds.length !== expectedFactCount ||
    !insight.signalIds.includes(signalId)
  )
    return null;
  const signals = await GrowthRunsRepository.listSignals(projectId, runId);
  const facts = insight.signalIds
    .map((id) => signals.find((signal) => signal.id === id))
    .filter((signal): signal is NonNullable<typeof signal> => Boolean(signal));
  if (facts.length !== expectedFactCount) return null;
  const byMetric = new Map(facts.map((fact) => [fact.metric, fact]));
  const expectedMetrics = [
    descriptor.controller.metric,
    ...descriptor.companionMetrics,
  ].toSorted();
  if (
    facts
      .map((fact) => fact.metric)
      .toSorted()
      .join("\u0000") !== expectedMetrics.join("\u0000")
  )
    return null;
  const position = byMetric.get("gsc_average_position");
  const impressions = byMetric.get("gsc_impressions");
  const clicks = byMetric.get("gsc_clicks");
  const ctr = byMetric.get("gsc_ctr");
  if (
    !position ||
    !impressions ||
    !clicks ||
    (descriptor.family === "low_ctr" && !ctr)
  )
    return null;
  const first = impressions;
  if (
    facts.some(
      (fact) =>
        fact.signalType !== descriptor.controller.signalType ||
        fact.entityType !== descriptor.controller.entityType ||
        fact.entityRef !== first.entityRef ||
        fact.periodStart !== first.periodStart ||
        fact.periodEnd !== first.periodEnd ||
        fact.capturedAt !== first.capturedAt ||
        fact.evidenceKind !== descriptor.controller.evidenceKind ||
        fact.evidenceRef !== first.evidenceRef ||
        fact.deltaValue !== fact.currentValue - fact.baselineValue,
    )
  )
    return null;
  const targetKinds = new Set(graph.targets.map((target) => target.targetType));
  const page = graph.targets.find((target) => target.targetType === "url");
  const site = graph.targets.find((target) => target.targetType === "site");
  const baselinePeriod = preceding28DayPeriod(first.periodStart);
  if (
    graph.targets.length !== 3 ||
    !targetKinds.has("keyword") ||
    !targetKinds.has("url") ||
    !targetKinds.has("site") ||
    !page ||
    !site ||
    !baselinePeriod ||
    !graph.targets.some(
      (target) =>
        target.targetType === "keyword" &&
        target.targetValue === first.entityRef,
    )
  )
    return null;
  if (
    !(descriptor.family === "low_ctr"
      ? await matchesLowCtrEvidenceRef(
          {
            projectId,
            site: site.targetValue,
            query: first.entityRef,
            page: page.targetValue,
            capturedAt: first.capturedAt,
            baselineWindow: {
              startDate: baselinePeriod.start,
              endDate: baselinePeriod.end,
            },
            currentWindow: {
              startDate: first.periodStart,
              endDate: first.periodEnd,
            },
            baseline: {
              position: position.baselineValue,
              impressions: impressions.baselineValue,
              clicks: clicks.baselineValue,
              ctr: ctr!.baselineValue,
            },
            current: {
              position: position.currentValue,
              impressions: impressions.currentValue,
              clicks: clicks.currentValue,
              ctr: ctr!.currentValue,
            },
          },
          first.evidenceRef,
        )
      : await matchesStrikingDistanceEvidenceRef(
          {
            projectId,
            site: site.targetValue,
            query: first.entityRef,
            page: page.targetValue,
            capturedAt: first.capturedAt,
            baselineWindow: {
              startDate: baselinePeriod.start,
              endDate: baselinePeriod.end,
            },
            currentWindow: {
              startDate: first.periodStart,
              endDate: first.periodEnd,
            },
            baseline: {
              position: position.baselineValue,
              impressions: impressions.baselineValue,
              clicks: clicks.baselineValue,
            },
            current: {
              position: position.currentValue,
              impressions: impressions.currentValue,
              clicks: clicks.currentValue,
            },
          },
          first.evidenceRef,
        ))
  )
    return null;
  return {
    graph,
    evidence: {
      kind:
        descriptor.family === "low_ctr"
          ? ("high_impression_low_ctr_query" as const)
          : ("striking_distance_query" as const),
      query: first.entityRef,
      page: page.targetValue,
      site: site.targetValue,
      baselinePeriod,
      currentPeriod: { start: first.periodStart, end: first.periodEnd },
      baseline: {
        position: position.baselineValue,
        impressions: impressions.baselineValue,
        clicks: clicks.baselineValue,
        ...(ctr ? { ctr: ctr.baselineValue } : {}),
      },
      current: {
        position: position.currentValue,
        impressions: impressions.currentValue,
        clicks: clicks.currentValue,
        ...(ctr ? { ctr: ctr.currentValue } : {}),
      },
    },
  };
}

async function legacySaved(
  projectId: string,
  signal: Awaited<ReturnType<typeof source>>["signal"],
  run: Awaited<ReturnType<typeof source>>["run"],
) {
  const found = await GrowthInsightsRepository.findRecommendationForSignal(
    projectId,
    signal.id,
    investigationKeys(signal.id).recommendation,
  );
  if (!found || found.runId !== run.id) return null;
  const qualified = await qualifiedGraph(
    projectId,
    run.id,
    signal.id,
    found.id,
    priorityPageInvestigationDescriptor,
  );
  if (!qualified) return null;
  return {
    signal,
    run,
    controllerSignalId: signal.id,
    controllerRunId: run.id,
    relationship: "controller" as const,
    suppressionReason: null,
    policyVersion: null,
    descriptor: priorityPageInvestigationDescriptor,
    ...qualified,
  };
}

async function getSaved(projectId: string, signalId: string) {
  const { signal, run } = await source(projectId, signalId);
  const linked =
    await GrowthOpportunityDecisionsRepository.getDecisionControllerSource(
      projectId,
      run.id,
      signal.id,
    );
  if (!linked) return legacySaved(projectId, signal, run);
  const controllerSource = await source(projectId, linked.controllerSignalId);
  if (controllerSource.run.id !== linked.controllerRunId) return null;
  const qualified = await qualifiedGraph(
    projectId,
    linked.controllerRunId,
    linked.controllerSignalId,
    linked.recommendationId,
    controllerSource.descriptor,
  );
  if (!qualified) return null;
  return {
    signal,
    run,
    controllerSignalId: linked.controllerSignalId,
    controllerRunId: linked.controllerRunId,
    relationship: linked.relationship,
    suppressionReason: linked.suppressionReason,
    policyVersion: linked.policyVersion,
    descriptor: controllerSource.descriptor,
    ...qualified,
  };
}

async function getMutableSaved(projectId: string, signalId: string) {
  const saved = await getSaved(projectId, signalId);
  if (!saved || saved.relationship !== "controller")
    throw new AppError("NOT_FOUND", "Growth investigation not found");
  return saved;
}

async function exactTemplateAction(
  projectId: string,
  controllerSignalId: string,
  recommendationId: string,
  descriptor: GrowthInvestigationTemplateDescriptor,
) {
  const action = await GrowthActionsRepository.getActionByKey(
    projectId,
    investigationKeysForDescriptor(descriptor, controllerSignalId).action,
  );
  return action?.recommendationId === recommendationId ? action : null;
}

async function getInvestigation(
  projectId: string,
  signalId: string,
): Promise<GrowthInvestigationView | null> {
  const saved = await getSaved(projectId, signalId);
  if (!saved) return null;
  const action = await exactTemplateAction(
    projectId,
    saved.controllerSignalId,
    saved.graph.recommendation.id,
    saved.descriptor,
  );
  if (saved.relationship === "suppressed") {
    if (!saved.suppressionReason || !saved.policyVersion)
      throw new AppError(
        "CONFLICT",
        "Growth investigation coverage decision is incomplete",
      );
    return growthInvestigationViewSchema.parse({
      relationship: "suppressed",
      recommendationId: saved.graph.recommendation.id,
      title: saved.graph.recommendation.title,
      status: saved.graph.recommendation.status,
      suppressionReason: saved.suppressionReason,
      policyVersion: saved.policyVersion,
      actionId: action?.id ?? null,
      dueOn: dueOn(action?.dueAt ?? null),
    });
  }
  return growthInvestigationViewSchema.parse({
    relationship: "controller",
    recommendationId: saved.graph.recommendation.id,
    title: saved.graph.recommendation.title,
    rationale: saved.graph.recommendation.rationale,
    steps: saved.graph.steps.map((step) => step.content),
    displayUrls: displayUrls(saved.graph.targets),
    status: saved.graph.recommendation.status,
    reviewVersion: saved.graph.recommendation.reviewVersion,
    dismissalReason: saved.graph.recommendation.dismissalReason,
    snoozedUntil: canonicalReviewTimestamp(
      saved.graph.recommendation.snoozedUntil,
    ),
    actionId: action?.id ?? null,
    dueOn: dueOn(action?.dueAt ?? null),
    templateVersion: saved.descriptor.templateVersion,
    ...(saved.evidence ? { evidenceSummary: saved.evidence } : {}),
  });
}

async function reviewInvestigation(input: GrowthInvestigationReviewInput) {
  const saved = await getMutableSaved(input.projectId, input.signalId);

  const review = {
    projectId: input.projectId,
    recommendationId: saved.graph.recommendation.id,
    expectedVersion: input.expectedVersion,
    ...(input.decision === "review_now"
      ? { expectedStatus: "snoozed" as const, status: "proposed" as const }
      : input.decision === "dismiss"
        ? {
            expectedStatus: "proposed" as const,
            status: "dismissed" as const,
            dismissalReason: input.dismissalReason,
          }
        : {
            expectedStatus: "proposed" as const,
            status: "snoozed" as const,
            snoozedUntil: `${input.snoozeUntil}T00:00:00.000Z`,
          }),
  };
  await GrowthInsightsService.reviewRecommendation(review);
  const projected = await getInvestigation(input.projectId, input.signalId);
  if (!projected)
    throw new AppError(
      "CONFLICT",
      "Growth investigation could not be read after review",
    );
  return projected;
}

function projectedWorkItem(
  action: {
    id: string;
    title: string;
    status: GrowthWorkItem["status"];
    stateVersion: number;
    dueAt: string;
    createdAt: string;
    runId: string;
  },
  targets: { targetType: string; targetValue: string }[],
): GrowthWorkItem {
  return {
    id: action.id,
    title: action.title,
    status: action.status,
    stateVersion: action.stateVersion,
    dueOn: dueOn(action.dueAt),
    createdAt: action.createdAt,
    runId: action.runId,
    displayUrls: displayUrls(targets),
  };
}

export async function getQualifiedWork(projectId: string, actionId: string) {
  const [action] = await GrowthActionsRepository.listInvestigationWork(
    projectId,
    1,
    actionId,
  );
  if (!action) throw new AppError("NOT_FOUND", "Growth Work item not found");
  return action;
}

async function updateWorkStatus(
  input: UpdateGrowthWorkStatusInput & { actorId: string },
) {
  const qualified = await getQualifiedWork(input.projectId, input.actionId);
  const transitioned = await GrowthActionsService.transitionAction({
    ...input,
    actorType: "user",
  });
  const targets = await GrowthActionsRepository.listActionTargetsForActions(
    input.projectId,
    [input.actionId],
  );
  return projectedWorkItem(
    { ...transitioned.action, runId: qualified.runId },
    targets,
  );
}

async function getWorkHistory(
  projectId: string,
  actionId: string,
): Promise<GrowthWorkHistory> {
  await getQualifiedWork(projectId, actionId);
  const events = await GrowthActionsRepository.listRecentActionEvents(
    projectId,
    actionId,
  );
  return {
    actionId,
    events: events.map((event) => ({
      version: event.actionVersion,
      eventType: event.eventType,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      recordedAt: event.createdAt,
    })),
    limit: WORK_LIMIT,
  };
}

async function approveInvestigation(input: {
  projectId: string;
  signalId: string;
  dueOn: string;
  actorId: string;
}) {
  const saved = await getMutableSaved(input.projectId, input.signalId);
  const keys = investigationKeysForDescriptor(
    saved.descriptor,
    saved.controllerSignalId,
  );
  const actionInput = {
    projectId: input.projectId,
    recommendationId: saved.graph.recommendation.id,
    creationKey: keys.action,
    title: saved.graph.recommendation.title,
    description: saved.graph.recommendation.rationale,
    dueAt: `${input.dueOn}T00:00:00.000Z`,
    targets: saved.graph.targets.map(({ targetType, targetValue }) => ({
      type: targetType,
      value: targetValue,
    })),
    actorType: "user" as const,
    actorId: input.actorId,
  };
  const targetNormalizationMode: GrowthTargetNormalizationMode | undefined =
    saved.descriptor.family === "striking_distance" ||
    saved.descriptor.family === "low_ctr" ||
    saved.descriptor.family === "persistent_rank_drop"
      ? "key_page_identity"
      : undefined;

  const replay = async (existing: {
    id: string;
    recommendationId: string;
    dueAt: string;
  }) => {
    if (existing.recommendationId !== saved.graph.recommendation.id)
      throw new AppError(
        "CONFLICT",
        "Growth investigation action identity conflicts with its recommendation",
      );
    if (dueOn(existing.dueAt) !== input.dueOn)
      throw new AppError(
        "CONFLICT",
        "Growth investigation action already has a different due date",
      );
    const graph = await GrowthActionsRepository.getActionGraph(
      input.projectId,
      existing.id,
    );
    if (!graph?.creationEvent)
      throw new AppError(
        "CONFLICT",
        "Growth investigation approval history is incomplete",
      );
    // Validate the complete immutable graph with its original actor and note.
    // A later reviewer can read that approval but cannot rewrite its intent.
    const replayInput = {
      ...actionInput,
      actorType: graph.creationEvent.actorType,
      actorId: graph.creationEvent.actorId,
      note: graph.creationEvent.note ?? undefined,
    };
    const verified = targetNormalizationMode
      ? await GrowthActionsService.createAction(
          replayInput,
          targetNormalizationMode,
        )
      : await GrowthActionsService.createAction(replayInput);
    return projectedWorkItem(
      { ...verified.action, runId: saved.run.id },
      verified.targets,
    );
  };

  const existing = await GrowthActionsRepository.getActionByKey(
    input.projectId,
    keys.action,
  );
  if (existing) return replay(existing);
  if (saved.graph.recommendation.status === "accepted") {
    throw new AppError(
      "CONFLICT",
      "Growth investigation approval is incomplete and needs review; its original due date and actor were not recorded",
    );
  }
  if (saved.graph.recommendation.status !== "proposed") {
    throw new AppError(
      "CONFLICT",
      "Growth investigation is no longer available",
    );
  }

  try {
    const graph = targetNormalizationMode
      ? await GrowthActionsService.approveProposedRecommendation(
          actionInput,
          saved.graph.recommendation.reviewVersion,
          targetNormalizationMode,
        )
      : await GrowthActionsService.approveProposedRecommendation(
          actionInput,
          saved.graph.recommendation.reviewVersion,
        );
    return projectedWorkItem(
      { ...graph.action, runId: saved.run.id },
      graph.targets,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "CONFLICT") {
      const winner = await GrowthActionsRepository.getActionByKey(
        input.projectId,
        keys.action,
      );
      if (winner) return replay(winner);
    }
    throw error;
  }
}

async function getWork(projectId: string): Promise<GrowthWorkOverview> {
  const actions = await GrowthActionsRepository.listInvestigationWork(
    projectId,
    WORK_LIMIT,
  );
  const targets = await GrowthActionsRepository.listActionTargetsForActions(
    projectId,
    actions.map((action) => action.id),
  );
  const targetsByAction = new Map<string, typeof targets>();
  for (const target of targets) {
    const current = targetsByAction.get(target.actionId) ?? [];
    current.push(target);
    targetsByAction.set(target.actionId, current);
  }
  return {
    actions: actions.map((action) =>
      projectedWorkItem(action, targetsByAction.get(action.id) ?? []),
    ),
    limit: WORK_LIMIT,
  };
}

export const GrowthInvestigationsService = {
  getInvestigation,
  reviewInvestigation,
  approveInvestigation,
  getWork,
  updateWorkStatus,
  getWorkHistory,
  getQualifiedWork,
} as const;
