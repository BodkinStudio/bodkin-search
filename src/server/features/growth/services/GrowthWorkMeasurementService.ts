import { AppError } from "@/server/lib/errors";
import type { StartGrowthMeasurementInput } from "@/types/schemas/growth-measurements";
import type {
  CollectGrowthWorkMeasurementInput,
  GrowthWorkMeasurementOverview,
  StartGrowthWorkMeasurementInput,
} from "@/types/schemas/growth-work";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { GrowthActionsRepository } from "../repositories/GrowthActionsRepository";
import { GrowthChangeEventsRepository } from "../repositories/GrowthChangeEventsRepository";
import { GrowthMeasurementsRepository } from "../repositories/GrowthMeasurementsRepository";
import { toChangeDto } from "./GrowthChangeLogService";
import { growthEvidenceDisplayUrl } from "./GrowthEvidencePacket";
import { getQualifiedWork } from "./GrowthInvestigationsService";
import { GrowthMeasurementsService } from "./GrowthMeasurementsService";
import { collectGrowthWorkMeasurementEvidence } from "./GrowthWorkMeasurementCollectionService";
import {
  growthWorkMeasurementPlanDto,
  growthWorkMeasurementSchedule,
} from "./GrowthWorkMeasurementProjection";
import { GrowthSettingsService } from "./GrowthSettingsService";

const CHANGE_LIMIT = 50;
const MAX_URL_TARGETS = 25;

export { growthWorkMeasurementSchedule } from "./GrowthWorkMeasurementProjection";

async function loadSources(projectId: string, actionId: string) {
  const action = await getQualifiedWork(projectId, actionId);
  const [graph, linkedChanges, settings, existingPlan, gscConnection] =
    await Promise.all([
      GrowthActionsRepository.getActionGraph(projectId, actionId),
      GrowthChangeEventsRepository.listManualChangeEventGraphsForAction(
        projectId,
        actionId,
        CHANGE_LIMIT,
      ),
      GrowthSettingsService.getSettings(projectId),
      GrowthMeasurementsRepository.getMeasurementPlanByAction(
        projectId,
        actionId,
      ),
      GscConnectionRepository.getByProjectId(projectId),
    ]);
  if (!graph) throw new AppError("NOT_FOUND", "Growth Work item not found");
  const urlTargets = graph.targets
    .filter(({ targetType }) => targetType === "url")
    .map(({ targetValue }) => targetValue)
    .toSorted((left, right) => left.localeCompare(right));
  return {
    action,
    graph,
    linkedChanges,
    settings,
    existingPlan,
    gscConnection,
    urlTargets,
  };
}

function proposalMetrics(urlTargets: string[]) {
  return urlTargets.flatMap((entityKey) => [
    {
      metricType: "search_clicks" as const,
      entityType: "url" as const,
      entityKey,
      isPrimary: true,
    },
    {
      metricType: "search_impressions" as const,
      entityType: "url" as const,
      entityKey,
      isPrimary: false,
    },
  ]);
}

async function getGrowthWorkMeasurement(
  projectId: string,
  actionId: string,
): Promise<GrowthWorkMeasurementOverview> {
  const sources = await loadSources(projectId, actionId);
  if (sources.existingPlan) {
    const verified = await GrowthMeasurementsService.getMeasurement(
      projectId,
      sources.existingPlan.id,
    );
    const validProjection =
      (sources.action.status === "measuring" &&
        verified.plan.status === "active" &&
        sources.action.stateVersion === verified.plan.actionVersion) ||
      (sources.action.status === "evaluated" &&
        verified.plan.status === "completed" &&
        sources.action.stateVersion === verified.plan.actionVersion + 1);
    return {
      actionId,
      actionStatus: sources.action.status,
      stateVersion: sources.action.stateVersion,
      state: validProjection
        ? verified.plan.status === "active"
          ? "active"
          : "completed"
        : "inconsistent",
      targetCount: sources.urlTargets.length,
      proposedMetrics: [],
      candidates: [],
      plan: await growthWorkMeasurementPlanDto(
        verified,
        sources.gscConnection !== null,
      ),
      limit: CHANGE_LIMIT,
    };
  }

  const candidates = sources.linkedChanges.map((change) => {
    const future = Date.parse(change.event.happenedAt) > Date.now();
    return {
      change: toChangeDto(change),
      schedule: future
        ? null
        : growthWorkMeasurementSchedule(
            change.event.happenedAt,
            sources.settings,
          ),
      unavailableReason: future ? ("future_change" as const) : null,
    };
  });
  const targetsMeasurable =
    sources.urlTargets.length > 0 &&
    sources.urlTargets.length <= MAX_URL_TARGETS;
  const proposedMetrics = targetsMeasurable
    ? proposalMetrics(sources.urlTargets).map((metric) => ({
        metricType: metric.metricType,
        displayTarget: growthEvidenceDisplayUrl(metric.entityKey).value,
        isPrimary: metric.isPrimary,
      }))
    : [];
  const state =
    sources.action.status === "measuring" ||
    sources.action.status === "evaluated"
      ? "inconsistent"
      : sources.action.status !== "implemented"
        ? "not_ready"
        : !targetsMeasurable
          ? "unmeasurable_targets"
          : candidates.some(({ schedule }) => schedule !== null)
            ? "eligible"
            : "needs_change";
  return {
    actionId,
    actionStatus: sources.action.status,
    stateVersion: sources.action.stateVersion,
    state,
    targetCount: sources.urlTargets.length,
    proposedMetrics,
    candidates,
    plan: null,
    limit: CHANGE_LIMIT,
  };
}

async function startGrowthWorkMeasurement(
  input: StartGrowthWorkMeasurementInput & { actorId: string },
): Promise<GrowthWorkMeasurementOverview> {
  const sources = await loadSources(input.projectId, input.actionId);
  let start: StartGrowthMeasurementInput;
  if (sources.existingPlan) {
    const existing = await GrowthMeasurementsService.getMeasurement(
      input.projectId,
      sources.existingPlan.id,
    );
    start = {
      projectId: input.projectId,
      actionId: input.actionId,
      expectedActionVersion: input.expectedActionVersion,
      implementationChangeEventId: input.implementationChangeEventId,
      baselineStart: existing.plan.baselineStart,
      baselineEnd: existing.plan.baselineEnd,
      cooldownEnd: existing.plan.cooldownEnd,
      measurementStart: existing.plan.measurementStart,
      measurementEnd: existing.plan.measurementEnd,
      longMeasurementEnd: existing.plan.longMeasurementEnd,
      comparisonMode: existing.plan.comparisonMode,
      metrics: existing.metrics.map(
        ({ metricType, entityType, entityKey, isPrimary }) => ({
          metricType,
          entityType,
          entityKey,
          isPrimary,
        }),
      ),
      actorType: "user",
      actorId: input.actorId,
      note: "Started measurement from a selected recorded website change.",
    };
  } else {
    if (
      sources.action.status !== "implemented" ||
      sources.action.stateVersion !== input.expectedActionVersion
    )
      throw new AppError("CONFLICT", "Growth Work is not ready to measure");
    if (
      sources.urlTargets.length < 1 ||
      sources.urlTargets.length > MAX_URL_TARGETS
    )
      throw new AppError(
        "VALIDATION_ERROR",
        "Growth Work needs between 1 and 25 URL targets",
      );
    const selected = sources.linkedChanges.find(
      ({ event }) => event.id === input.implementationChangeEventId,
    );
    if (!selected)
      throw new AppError("NOT_FOUND", "Linked website change not found");
    if (Date.parse(selected.event.happenedAt) > Date.now())
      throw new AppError(
        "VALIDATION_ERROR",
        "Website change cannot be in the future",
      );
    const schedule = growthWorkMeasurementSchedule(
      selected.event.happenedAt,
      sources.settings,
    );
    start = {
      projectId: input.projectId,
      actionId: input.actionId,
      expectedActionVersion: input.expectedActionVersion,
      implementationChangeEventId: input.implementationChangeEventId,
      baselineStart: schedule.baselineStart,
      baselineEnd: schedule.baselineEnd,
      cooldownEnd: schedule.cooldownEnd,
      measurementStart: schedule.measurementStart,
      measurementEnd: schedule.measurementEnd,
      longMeasurementEnd: schedule.longMeasurementEnd,
      comparisonMode: "preceding_period",
      metrics: proposalMetrics(sources.urlTargets),
      actorType: "user",
      actorId: input.actorId,
      note: "Started measurement from a selected recorded website change.",
    };
  }
  await GrowthMeasurementsService.startMeasurement(start);
  return getGrowthWorkMeasurement(input.projectId, input.actionId);
}

async function collectGrowthWorkMeasurement(
  input: CollectGrowthWorkMeasurementInput,
): Promise<GrowthWorkMeasurementOverview> {
  await collectGrowthWorkMeasurementEvidence(input);
  return getGrowthWorkMeasurement(input.projectId, input.actionId);
}

export const GrowthWorkMeasurementService = {
  getGrowthWorkMeasurement,
  startGrowthWorkMeasurement,
  collectGrowthWorkMeasurement,
} as const;
