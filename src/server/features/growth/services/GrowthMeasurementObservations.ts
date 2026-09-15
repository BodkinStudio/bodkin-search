import { sha256Hex } from "@/server/lib/audit/ids";
import { AppError } from "@/server/lib/errors";
import type { RecordGrowthMeasurementObservationInput } from "@/types/schemas/growth-measurements";
import { GrowthMeasurementsRepository as repo } from "../repositories/GrowthMeasurementsRepository";
import {
  assertScalar,
  conflict,
  expectedPeriod,
  observationFact,
  storedObservationFact,
  validation,
} from "./GrowthMeasurementFacts";

async function assertExactObservation(
  stored: NonNullable<
    Awaited<ReturnType<typeof repo.getMeasurementObservation>>
  >,
  fact: ReturnType<typeof observationFact>,
) {
  const factHash = await sha256Hex(JSON.stringify(fact));
  if (
    stored.factHash !== factHash ||
    JSON.stringify(storedObservationFact(stored)) !== JSON.stringify(fact)
  ) {
    conflict("Measurement Observation coordinate contains a different fact");
  }
  return stored;
}

export async function recordObservation(
  input: RecordGrowthMeasurementObservationInput,
) {
  const [winner] = await recordObservations([input]);
  if (!winner) conflict("Measurement Observation was not recorded");
  return winner;
}

async function assertNoConcurrentDrift(
  projectId: string,
  measurementPlanId: string,
  facts: ReturnType<typeof observationFact>[],
) {
  const current = await repo.getMeasurementGraph(projectId, measurementPlanId);
  if (!current) return;
  const winners = new Map(
    current.observations.map((observation) => [
      `${observation.metricId}:${observation.periodType}`,
      observation,
    ]),
  );
  for (const fact of facts) {
    const winner = winners.get(`${fact.metricId}:${fact.periodType}`);
    if (winner) await assertExactObservation(winner, fact);
  }
}

export async function recordObservations(
  inputs: RecordGrowthMeasurementObservationInput[],
) {
  if (inputs.length === 0)
    validation("Measurement Observations must not be empty");
  const [firstInput] = inputs;
  if (!firstInput) validation("Measurement Observations must not be empty");
  if (
    inputs.some(
      (input) =>
        input.projectId !== firstInput.projectId ||
        input.measurementPlanId !== firstInput.measurementPlanId,
    )
  ) {
    validation("Measurement Observations must belong to one Measurement Plan");
  }

  // Build all canonical facts before reading or issuing any write, so a bad
  // coordinate can never turn an otherwise complete provider attempt partial.
  const facts = inputs.map((input) => observationFact(input));
  const graph = await repo.getMeasurementGraph(
    firstInput.projectId,
    firstInput.measurementPlanId,
  );
  if (!graph) throw new AppError("NOT_FOUND", "Measurement Plan not found");
  const metrics = new Map(graph.metrics.map((metric) => [metric.id, metric]));
  const existing = new Map(
    graph.observations.map((observation) => [
      `${observation.metricId}:${observation.periodType}`,
      observation,
    ]),
  );
  const pending = new Map<string, { fact: (typeof facts)[number] }>();

  for (const fact of facts) {
    const metric = metrics.get(fact.metricId);
    if (!metric)
      throw new AppError("NOT_FOUND", "Measurement Plan or Metric not found");
    const period = expectedPeriod(graph.plan, fact.periodType);
    if (
      fact.effectiveStart !== period.start ||
      fact.effectiveEnd !== period.end
    ) {
      validation(
        "Observation effective dates must match its Measurement window",
      );
    }
    assertScalar(metric.metricType, fact.value);
    if (
      !Number.isFinite(fact.completeness) ||
      fact.completeness < 0 ||
      fact.completeness > 1
    ) {
      validation("Observation completeness must be between 0 and 1");
    }
    const coordinate = `${fact.metricId}:${fact.periodType}`;
    const priorPending = pending.get(coordinate);
    if (priorPending) {
      if (JSON.stringify(priorPending.fact) !== JSON.stringify(fact))
        conflict(
          "Measurement Observation coordinate contains a different fact",
        );
      continue;
    }
    pending.set(coordinate, { fact });
  }

  const missing = [] as Array<
    Parameters<typeof repo.recordMeasurementObservation>[0]
  >;
  for (const { fact } of pending.values()) {
    const coordinate = `${fact.metricId}:${fact.periodType}`;
    const stored = existing.get(coordinate);
    if (stored) {
      await assertExactObservation(stored, fact);
      continue;
    }
    if (graph.plan.status !== "active")
      conflict("Measurement Plan no longer accepts Observations");
    missing.push({
      id: crypto.randomUUID(),
      ...fact,
      factHash: await sha256Hex(JSON.stringify(fact)),
    });
  }
  if (missing.length > 0) {
    try {
      await repo.recordMeasurementObservations({ observations: missing });
    } catch (error) {
      // A writer guard can reject a concurrent fact drift before it inserts
      // any sibling. Re-read to turn that expected database abort back into
      // the domain conflict callers already understand; unrelated failures
      // retain their original error.
      await assertNoConcurrentDrift(
        firstInput.projectId,
        firstInput.measurementPlanId,
        facts,
      );
      throw error;
    }
  }

  const winnerGraph = await repo.getMeasurementGraph(
    firstInput.projectId,
    firstInput.measurementPlanId,
  );
  if (!winnerGraph) conflict("Measurement Plan was not recorded");
  const winners = new Map(
    winnerGraph.observations.map((observation) => [
      `${observation.metricId}:${observation.periodType}`,
      observation,
    ]),
  );
  return Promise.all(
    facts.map(async (fact) => {
      const winner = winners.get(`${fact.metricId}:${fact.periodType}`);
      if (!winner) conflict("Measurement Observation was not recorded");
      return assertExactObservation(winner, fact);
    }),
  );
}
