import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { GrowthActionsRepository } from "../repositories/GrowthActionsRepository";
import { GrowthMeasurementsRepository } from "../repositories/GrowthMeasurementsRepository";
import { GrowthPageMonitorRepository } from "../repositories/GrowthPageMonitorRepository";
import { GrowthChangeEventsService } from "./GrowthChangeEventsService";
import { GrowthMeasurementsService } from "./GrowthMeasurementsService";
import { GrowthSettingsService } from "./GrowthSettingsService";
import { collectGrowthWorkMeasurementEvidence } from "./GrowthWorkMeasurementCollectionService";
import { growthWorkMeasurementSchedule } from "./GrowthWorkMeasurementProjection";
import { proposalMetrics } from "./growthMeasurementMetrics";

const MAX_URL_TARGETS = 25;

async function absoluteTargets(projectId: string, targets: string[]) {
  const domain = await GrowthPageMonitorRepository.projectDomain(projectId);
  if (!domain) return [];
  const origin = `https://${domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  return [
    ...new Set(
      targets.flatMap((value) => {
        try {
          return [new URL(value, origin).toString()];
        } catch {
          return [];
        }
      }),
    ),
  ].toSorted();
}

/**
 * When a plan action is marked Shipped: log the change against the pages it
 * targets (the person who shipped it is its author), link it to the action
 * and start the standard before/after Search Console comparison. Returns why
 * nothing was started when the action cannot be measured yet.
 */
async function startOnShipped(input: {
  projectId: string;
  actionId: string;
  actorId: string;
}) {
  const graph = await GrowthActionsRepository.getActionGraph(
    input.projectId,
    input.actionId,
  );
  const action = graph?.action;
  if (!graph || action?.status !== "implemented")
    return { started: false, reason: "not_shipped" } as const;
  const urls = await absoluteTargets(
    input.projectId,
    graph.targets
      .filter(({ targetType }) => targetType === "url")
      .map(({ targetValue }) => targetValue),
  );
  if (urls.length === 0 || urls.length > MAX_URL_TARGETS)
    return { started: false, reason: "no_page_targets" } as const;
  if (!(await GscConnectionRepository.getByProjectId(input.projectId)))
    return { started: false, reason: "search_console_missing" } as const;
  if (
    await GrowthMeasurementsRepository.getMeasurementPlanByAction(
      input.projectId,
      input.actionId,
    )
  )
    return { started: false, reason: "already_measuring" } as const;

  const shippedAt = action.implementedAt ?? new Date().toISOString();
  const change = await GrowthChangeEventsService.recordManualEvent({
    projectId: input.projectId,
    creationKey: `shipped:${input.actionId}:${action.stateVersion}`,
    changeType: "unknown",
    actorType: "user",
    actorId: input.actorId,
    description: `Shipped: ${action.title}`.slice(0, 5000),
    happenedAt: shippedAt,
    urls,
  });
  await GrowthChangeEventsService.linkAction({
    projectId: input.projectId,
    actionId: input.actionId,
    changeEventId: change.event.id,
  });
  const settings = await GrowthSettingsService.getSettings(input.projectId);
  const schedule = growthWorkMeasurementSchedule(shippedAt, settings);
  await GrowthMeasurementsService.startMeasurement({
    projectId: input.projectId,
    actionId: input.actionId,
    expectedActionVersion: action.stateVersion,
    implementationChangeEventId: change.event.id,
    ...schedule,
    comparisonMode: "preceding_period",
    metrics: proposalMetrics(urls),
    actorType: "user",
    actorId: input.actorId,
    note: "Started automatically when the action was marked Shipped.",
  });
  return { started: true } as const;
}

// Collects every active measurement in the project whose next window has
// closed and whose Search Console data is available. Windows that are not
// ready yet are skipped quietly; the watch comes back next week.
async function collectDue(input: { projectId: string }, now = new Date()) {
  const plans = await GrowthMeasurementsRepository.listActivePlans(
    input.projectId,
  );
  let collected = 0;
  for (const plan of plans) {
    try {
      await collectGrowthWorkMeasurementEvidence(
        {
          projectId: input.projectId,
          actionId: plan.actionId,
          expectedActionVersion: plan.actionVersion,
        },
        { now },
      );
      collected++;
    } catch {
      // not ready, or already complete
    }
  }
  return { plans: plans.length, collected };
}

export const GrowthPlanMeasurementService = {
  startOnShipped,
  collectDue,
} as const;
