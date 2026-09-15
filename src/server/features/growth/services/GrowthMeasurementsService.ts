import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type {
  FinalizeGrowthMeasurementInput,
  StartGrowthMeasurementInput,
} from "@/types/schemas/growth-measurements";
import { GrowthMeasurementsRepository as repo } from "../repositories/GrowthMeasurementsRepository";
import { growthActionEventFactHash } from "./GrowthActionEventFact";
import {
  assertPlanWindows,
  calendarDateInTimezone,
  canonicalizeMetrics,
  canonicalTimestamp,
  conflict,
  type MeasurementGraph,
  observationFacts,
  observationsHash,
  type PlanFact,
  primaryEvidenceCoverage,
  resultFact,
  validation,
} from "./GrowthMeasurementFacts";
import {
  assertExactMeasurementResult,
  assertExactMeasurementStart,
  assertStoredMeasurementGraph,
} from "./GrowthMeasurementGraph";
import {
  recordObservation,
  recordObservations,
} from "./GrowthMeasurementObservations";
import { GrowthSettingsService } from "./GrowthSettingsService";

async function startMeasurement(input: StartGrowthMeasurementInput) {
  const projectDomain = await repo.projectDomain(input.projectId);
  if (!projectDomain)
    throw new AppError("NOT_FOUND", "Growth project not found");
  const metrics = canonicalizeMetrics(projectDomain, input.metrics);
  const existing = await repo.getMeasurementPlanByAction(
    input.projectId,
    input.actionId,
  );
  if (existing) {
    const graph = await repo.getMeasurementGraph(input.projectId, existing.id);
    if (!graph) conflict("Stored Measurement Plan graph is incomplete");
    return assertExactMeasurementStart(
      graph,
      {
        projectId: input.projectId,
        actionId: input.actionId,
        implementationChangeEventId: input.implementationChangeEventId,
        actionVersion: input.expectedActionVersion + 1,
        anchorAt: existing.anchorAt,
        anchorDate: existing.anchorDate,
        reportTimezone: existing.reportTimezone,
        baselineStart: input.baselineStart,
        baselineEnd: input.baselineEnd,
        cooldownEnd: input.cooldownEnd,
        measurementStart: input.measurementStart,
        measurementEnd: input.measurementEnd,
        longMeasurementEnd: input.longMeasurementEnd ?? null,
        comparisonMode: input.comparisonMode,
        metrics,
      },
      input,
    );
  }

  const [action, settings, changeEvent] = await Promise.all([
    repo.getAction(input.projectId, input.actionId),
    GrowthSettingsService.getSettings(input.projectId),
    repo.getLinkedManualChangeEvent(
      input.projectId,
      input.actionId,
      input.implementationChangeEventId,
    ),
  ]);
  if (!action) throw new AppError("NOT_FOUND", "Growth Action not found");
  if (
    action.status !== "implemented" ||
    action.stateVersion !== input.expectedActionVersion ||
    !action.implementedAt
  ) {
    conflict("Growth Action is not at the expected implemented version");
  }
  if (!changeEvent)
    validation(
      "Implementation Change Event must be a manual event linked to this Growth Action",
    );
  const anchorAt = canonicalTimestamp(
    changeEvent.happenedAt,
    "Implementation Change Event time",
  );
  if (anchorAt > new Date().toISOString())
    validation("Implementation Change Event time cannot be in the future");
  const anchorDate = anchorAt.slice(0, 10);
  const fact: PlanFact = {
    projectId: input.projectId,
    actionId: input.actionId,
    implementationChangeEventId: input.implementationChangeEventId,
    actionVersion: input.expectedActionVersion + 1,
    anchorAt,
    anchorDate,
    reportTimezone: settings.reportTimezone,
    baselineStart: input.baselineStart,
    baselineEnd: input.baselineEnd,
    cooldownEnd: input.cooldownEnd,
    measurementStart: input.measurementStart,
    measurementEnd: input.measurementEnd,
    longMeasurementEnd: input.longMeasurementEnd ?? null,
    comparisonMode: input.comparisonMode,
    metrics,
  };
  assertPlanWindows(fact);
  const [factHash, eventFactHash] = await Promise.all([
    sha256Hex(JSON.stringify(fact)),
    growthActionEventFactHash({
      projectId: input.projectId,
      actionId: input.actionId,
      actionVersion: fact.actionVersion,
      eventType: "status_changed",
      fromStatus: "implemented",
      toStatus: "measuring",
      actorType: input.actorType,
      actorId: input.actorId,
      note: input.note ?? null,
    }),
  ]);
  await repo.startMeasurementGraph({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    actionId: input.actionId,
    implementationChangeEventId: input.implementationChangeEventId,
    factHash,
    expectedActionVersion: input.expectedActionVersion,
    anchorAt,
    anchorDate,
    reportTimezone: settings.reportTimezone,
    baselineStart: input.baselineStart,
    baselineEnd: input.baselineEnd,
    cooldownEnd: input.cooldownEnd,
    measurementStart: input.measurementStart,
    measurementEnd: input.measurementEnd,
    longMeasurementEnd: input.longMeasurementEnd ?? null,
    comparisonMode: input.comparisonMode,
    metrics: metrics.map((metric) => ({ id: crypto.randomUUID(), ...metric })),
    eventId: crypto.randomUUID(),
    eventFactHash,
    actorType: input.actorType,
    actorId: input.actorId,
    note: input.note ?? null,
  });
  const winner = await repo.getMeasurementPlanByAction(
    input.projectId,
    input.actionId,
  );
  if (!winner) conflict("Measurement Plan was not created");
  const graph = await repo.getMeasurementGraph(input.projectId, winner.id);
  if (!graph) conflict("Stored Measurement Plan graph is incomplete");
  return assertExactMeasurementStart(graph, fact, input);
}

function assertPrimaryCoverage(graph: MeasurementGraph) {
  if (!primaryEvidenceCoverage(graph).complete)
    validation("Every primary Metric needs complete Measurement evidence");
}

async function writeResult(
  graph: MeasurementGraph,
  input: FinalizeGrowthMeasurementInput,
  evaluatedAt: string,
  confoundingChangeEventIds: string[],
  frozenObservationsHash: string,
) {
  const fact = resultFact(
    input,
    frozenObservationsHash,
    confoundingChangeEventIds,
  );
  const [factHash, eventFactHash] = await Promise.all([
    sha256Hex(JSON.stringify(fact)),
    growthActionEventFactHash({
      projectId: input.projectId,
      actionId: graph.plan.actionId,
      actionVersion: graph.plan.actionVersion + 1,
      eventType: "status_changed",
      fromStatus: "measuring",
      toStatus: "evaluated",
      actorType: input.actorType,
      actorId: input.actorId,
      note: input.note ?? null,
    }),
  ]);
  await repo.finalizeMeasurementGraph({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    measurementPlanId: input.measurementPlanId,
    measurementPlanFactHash: graph.plan.factHash,
    actionId: graph.plan.actionId,
    expectedActionVersion: input.expectedActionVersion,
    factHash,
    observationsHash: frozenObservationsHash,
    observations: observationFacts(graph),
    outcome: input.outcome,
    confidence: fact.confidence,
    summary: input.summary,
    evaluatedAt,
    model: input.model ?? null,
    promptVersion: input.promptVersion ?? null,
    confoundingChangeEventIds,
    eventId: crypto.randomUUID(),
    eventFactHash,
    actorType: input.actorType,
    actorId: input.actorId,
    note: input.note ?? null,
  });
}

async function finalizeMeasurement(
  input: FinalizeGrowthMeasurementInput,
  options: { now?: Date; expectedObservationsHash?: string } = {},
) {
  const first = await repo.getMeasurementGraph(
    input.projectId,
    input.measurementPlanId,
  );
  if (!first) throw new AppError("NOT_FOUND", "Measurement Plan not found");
  if (input.expectedActionVersion !== first.plan.actionVersion)
    conflict("Measurement Action version is stale");
  const firstObservationsHash = await observationsHash(first);
  if (
    options.expectedObservationsHash !== undefined &&
    options.expectedObservationsHash !== firstObservationsHash
  ) {
    conflict("Measurement evidence changed since review");
  }
  const confounders = [...new Set(input.confoundingChangeEventIds)].toSorted(
    (left, right) => left.localeCompare(right),
  );
  if (
    first.implementationChangeEventId != null &&
    confounders.includes(first.implementationChangeEventId)
  ) {
    validation(
      "Implementation Change Event cannot also be a Measurement confounder",
    );
  }
  const firstFact = resultFact(input, firstObservationsHash, confounders);
  if (first.result)
    return assertExactMeasurementResult(first, firstFact, input);

  await assertStoredMeasurementGraph(first);
  const action = await repo.getAction(input.projectId, first.plan.actionId);
  if (!action) throw new AppError("NOT_FOUND", "Growth Action not found");
  if (
    action.status !== "measuring" ||
    action.stateVersion !== input.expectedActionVersion
  ) {
    conflict("Growth Action is not at the expected measuring version");
  }
  const evaluatedAt = (options.now ?? new Date()).toISOString();
  const dueDate = first.plan.longMeasurementEnd ?? first.plan.measurementEnd;
  if (calendarDateInTimezone(evaluatedAt, first.plan.reportTimezone) <= dueDate)
    conflict("Measurement window has not completed");
  if (input.outcome !== "not_measurable") assertPrimaryCoverage(first);
  const changes = await repo.listChangeEventsByIds(
    input.projectId,
    confounders,
  );
  if (changes.length !== confounders.length)
    throw new AppError("NOT_FOUND", "Growth Change Event not found");

  await writeResult(
    first,
    input,
    evaluatedAt,
    confounders,
    firstObservationsHash,
  );
  let winner = await repo.getMeasurementGraph(
    input.projectId,
    input.measurementPlanId,
  );
  if (!winner) conflict("Stored Measurement Result graph is incomplete");
  const winnerObservationsHash = await observationsHash(winner);
  if (
    options.expectedObservationsHash !== undefined &&
    options.expectedObservationsHash !== winnerObservationsHash
  ) {
    conflict("Measurement evidence changed during finalization");
  }
  if (winner.result) {
    const winnerFact = resultFact(input, winnerObservationsHash, confounders);
    return assertExactMeasurementResult(winner, winnerFact, input);
  }

  // A committed Observation may win the Plan lock after the service snapshot.
  // Retry once with that complete set; any later race becomes a clean conflict.
  if (options.expectedObservationsHash !== undefined)
    conflict("Measurement finalization did not preserve reviewed evidence");
  if (winner.plan.status !== "active")
    conflict("Stored Measurement Result graph is incomplete");
  if (input.outcome !== "not_measurable") assertPrimaryCoverage(winner);
  await writeResult(
    winner,
    input,
    evaluatedAt,
    confounders,
    winnerObservationsHash,
  );
  winner = await repo.getMeasurementGraph(
    input.projectId,
    input.measurementPlanId,
  );
  if (!winner?.result) conflict("Measurement Result lost a concurrent race");
  const winnerFact = resultFact(
    input,
    await observationsHash(winner),
    confounders,
  );
  return assertExactMeasurementResult(winner, winnerFact, input);
}

async function getMeasurement(projectId: string, measurementPlanId: string) {
  const graph = await repo.getMeasurementGraph(projectId, measurementPlanId);
  if (!graph) throw new AppError("NOT_FOUND", "Measurement Plan not found");
  return assertStoredMeasurementGraph(graph);
}

export const GrowthMeasurementsService = {
  startMeasurement,
  recordObservation,
  recordObservations,
  finalizeMeasurement,
  getMeasurement,
} as const;
