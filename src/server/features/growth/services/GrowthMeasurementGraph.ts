import { sha256Hex } from "@/server/lib/audit/ids";
import {
  type FinalizeGrowthMeasurementInput,
  MAX_GROWTH_MEASUREMENT_CONFOUNDERS,
  MAX_GROWTH_MEASUREMENT_METRICS,
  type StartGrowthMeasurementInput,
} from "@/types/schemas/growth-measurements";
import {
  assertGrowthActionEvent,
  growthActionEventFactHash,
} from "./GrowthActionEventFact";
import {
  calendarDateInTimezone,
  canonicalTimestamp,
  conflict,
  type MeasurementGraph,
  observationsHash,
  type PlanFact,
  type ResultFact,
  storedObservationFact,
  storedPlanFact,
  storedResultFact,
} from "./GrowthMeasurementFacts";

const MAX_STORED_OBSERVATIONS = MAX_GROWTH_MEASUREMENT_METRICS * 3;

function percentDelta(baseline: number, current: number) {
  return baseline === 0 ? null : ((current - baseline) / baseline) * 100;
}

function deriveComparisons(graph: MeasurementGraph) {
  const values = new Map(
    graph.observations.map((observation) => [
      `${observation.metricId}:${observation.periodType}`,
      observation.value,
    ]),
  );
  return graph.metrics.map((metric) => {
    const baselineValue = values.get(`${metric.id}:baseline`) ?? null;
    const currentValue = values.get(`${metric.id}:measurement`) ?? null;
    const longTermValue = values.get(`${metric.id}:long_term`) ?? null;
    return {
      metricId: metric.id,
      metricType: metric.metricType,
      entityType: metric.entityType,
      entityKey: metric.entityKey,
      isPrimary: metric.isPrimary,
      baselineValue,
      currentValue,
      absoluteDelta:
        baselineValue == null || currentValue == null
          ? null
          : currentValue - baselineValue,
      percentDelta:
        baselineValue == null || currentValue == null
          ? null
          : percentDelta(baselineValue, currentValue),
      longTermValue,
      longTermAbsoluteDelta:
        baselineValue == null || longTermValue == null
          ? null
          : longTermValue - baselineValue,
      longTermPercentDelta:
        baselineValue == null || longTermValue == null
          ? null
          : percentDelta(baselineValue, longTermValue),
    };
  });
}

async function assertLifecycleEvent(
  graph: MeasurementGraph,
  version: number,
  fromStatus: "implemented" | "measuring",
  toStatus: "measuring" | "evaluated",
) {
  const event = graph.actionEvents.find(
    ({ actionVersion }) => actionVersion === version,
  );
  if (!event) conflict("Stored Measurement has no matching Action event");
  const factHash = await growthActionEventFactHash({
    projectId: graph.plan.projectId,
    actionId: graph.plan.actionId,
    actionVersion: version,
    eventType: "status_changed",
    fromStatus,
    toStatus,
    actorType: event.actorType,
    actorId: event.actorId,
    note: event.note,
  });
  return assertGrowthActionEvent(event, {
    projectId: graph.plan.projectId,
    actionId: graph.plan.actionId,
    actionVersion: version,
    eventType: "status_changed",
    fromStatus,
    toStatus,
    actorType: event.actorType,
    actorId: event.actorId,
    note: event.note,
    factHash,
  });
}

export async function assertStoredMeasurementGraph(graph: MeasurementGraph) {
  if (graph.metrics.length > MAX_GROWTH_MEASUREMENT_METRICS)
    conflict("Stored Measurement exceeds the Metric integrity limit");
  if (graph.observations.length > MAX_STORED_OBSERVATIONS)
    conflict("Stored Measurement exceeds the Observation integrity limit");
  if (
    graph.confoundingChangeEventIds.length > MAX_GROWTH_MEASUREMENT_CONFOUNDERS
  )
    conflict("Stored Measurement exceeds the confounder integrity limit");
  const factHash = await sha256Hex(JSON.stringify(storedPlanFact(graph)));
  if (graph.plan.factHash !== factHash)
    conflict("Stored Measurement Plan graph does not match its immutable fact");
  if (graph.implementationChangeEventId != null) {
    if (
      graph.implementationChangeEventSource !== "manual" ||
      graph.implementationChangeEventHappenedAt == null ||
      canonicalTimestamp(
        graph.implementationChangeEventHappenedAt,
        "Implementation Change Event time",
      ) !== graph.plan.anchorAt ||
      graph.implementationChangeEventHappenedAt.slice(0, 10) !==
        graph.plan.anchorDate
    ) {
      conflict(
        "Stored Measurement Plan anchor does not match its Change Event",
      );
    }
  }
  if (
    canonicalTimestamp(graph.plan.anchorAt, "Measurement anchor") !==
    graph.plan.anchorAt
  )
    conflict("Stored Measurement anchor is not canonical");
  if (
    graph.implementationChangeEventId == null &&
    calendarDateInTimezone(graph.plan.anchorAt, graph.plan.reportTimezone) !==
      graph.plan.anchorDate
  )
    conflict("Stored Measurement anchor date does not match its timezone");
  await assertLifecycleEvent(
    graph,
    graph.plan.actionVersion,
    "implemented",
    "measuring",
  );

  for (const observation of graph.observations) {
    const hash = await sha256Hex(
      JSON.stringify(storedObservationFact(observation)),
    );
    if (hash !== observation.factHash)
      conflict(
        "Stored Measurement Observation does not match its immutable fact",
      );
  }

  if (!graph.result) {
    if (graph.plan.status !== "active" || graph.plan.completedAt != null)
      conflict("Stored Measurement lifecycle is incomplete");
  } else {
    if (
      graph.plan.status !== "completed" ||
      graph.plan.completedAt !== graph.result.evaluatedAt ||
      graph.result.observationsHash !== (await observationsHash(graph))
    ) {
      conflict("Stored Measurement Result does not match its frozen evidence");
    }
    await assertLifecycleEvent(
      graph,
      graph.plan.actionVersion + 1,
      "measuring",
      "evaluated",
    );
  }
  return {
    ...graph,
    dueDate: graph.plan.longMeasurementEnd ?? graph.plan.measurementEnd,
    comparisons: deriveComparisons(graph),
  };
}

export async function assertExactMeasurementStart(
  graph: MeasurementGraph,
  expected: PlanFact,
  actor: Pick<StartGrowthMeasurementInput, "actorType" | "actorId" | "note">,
) {
  const expectedHash = await sha256Hex(JSON.stringify(expected));
  if (
    graph.plan.factHash !== expectedHash ||
    JSON.stringify(storedPlanFact(graph)) !== JSON.stringify(expected)
  ) {
    conflict("Growth Action already has a different Measurement Plan");
  }
  const eventHash = await growthActionEventFactHash({
    projectId: expected.projectId,
    actionId: expected.actionId,
    actionVersion: expected.actionVersion,
    eventType: "status_changed",
    fromStatus: "implemented",
    toStatus: "measuring",
    actorType: actor.actorType,
    actorId: actor.actorId,
    note: actor.note ?? null,
  });
  assertGrowthActionEvent(
    graph.actionEvents.find(
      ({ actionVersion }) => actionVersion === expected.actionVersion,
    ),
    {
      projectId: expected.projectId,
      actionId: expected.actionId,
      actionVersion: expected.actionVersion,
      eventType: "status_changed",
      fromStatus: "implemented",
      toStatus: "measuring",
      actorType: actor.actorType,
      actorId: actor.actorId,
      note: actor.note ?? null,
      factHash: eventHash,
    },
  );
  return assertStoredMeasurementGraph(graph);
}

export async function assertExactMeasurementResult(
  graph: MeasurementGraph,
  expected: ResultFact,
  input: FinalizeGrowthMeasurementInput,
) {
  if (!graph.result) conflict("Stored Measurement Result graph is incomplete");
  const factHash = await sha256Hex(JSON.stringify(expected));
  if (
    graph.result.factHash !== factHash ||
    JSON.stringify(storedResultFact(graph)) !== JSON.stringify(expected)
  ) {
    conflict("Measurement Plan already has a different Result");
  }
  const eventHash = await growthActionEventFactHash({
    projectId: input.projectId,
    actionId: graph.plan.actionId,
    actionVersion: graph.plan.actionVersion + 1,
    eventType: "status_changed",
    fromStatus: "measuring",
    toStatus: "evaluated",
    actorType: input.actorType,
    actorId: input.actorId,
    note: input.note ?? null,
  });
  assertGrowthActionEvent(
    graph.actionEvents.find(
      ({ actionVersion }) => actionVersion === graph.plan.actionVersion + 1,
    ),
    {
      projectId: input.projectId,
      actionId: graph.plan.actionId,
      actionVersion: graph.plan.actionVersion + 1,
      eventType: "status_changed",
      fromStatus: "measuring",
      toStatus: "evaluated",
      actorType: input.actorType,
      actorId: input.actorId,
      note: input.note ?? null,
      factHash: eventHash,
    },
  );
  return assertStoredMeasurementGraph(graph);
}
