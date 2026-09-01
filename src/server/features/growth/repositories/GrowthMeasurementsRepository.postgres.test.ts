/* eslint-disable max-lines, max-lines-per-function -- live-provider concurrency acceptance is clearer as one self-contained fixture */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthMeasurementsRepository as RepositoryExport } from "./GrowthMeasurementsRepository";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

type Repository = typeof RepositoryExport;
type WithPgClient = typeof withPgClientExport;

let sql: ReturnType<typeof postgres>;
let repo: Repository;
let withPgClient: WithPgClient;

const describePostgres = testUrl ? describe : describe.skip;

async function seedSource(suffix: string, actionNames: string[]) {
  const organizationId = `gm_org_${suffix}`;
  const projectId = `gm_project_${suffix}`;
  const runId = `gm_run_${suffix}`;
  await sql`
    INSERT INTO organization (id, name, slug, created_at)
    VALUES (${organizationId}, 'Growth Measurement test', ${`gm-${suffix}`}, now())
  `;
  await sql`
    INSERT INTO projects (id, organization_id, name, domain)
    VALUES (${projectId}, ${organizationId}, 'Growth Measurement test', 'example.com')
  `;
  await sql`
    INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, detector_version
    ) VALUES (
      ${runId}, ${projectId}, 'daily_monitor', 'manual', 'running',
      ${`measurement-${suffix}`}, '2026-08-01', '2026-08-29',
      '2026-08-29T10:00:00.000Z', 'v1'
    )
  `;
  for (const actionName of actionNames) {
    const recommendationId = `gm_rec_${actionName}_${suffix}`;
    const actionId = `gm_action_${actionName}_${suffix}`;
    await sql`
      INSERT INTO growth_recommendations (
        id, project_id, run_id, creation_key, fact_hash, title, rationale,
        category, impact, commercial_relevance, effort, urgency, confidence,
        priority_score, status, review_version
      ) VALUES (
        ${recommendationId}, ${projectId}, ${runId},
        ${`gm-${actionName}-${suffix}`}, ${"a".repeat(64)}, 'Refresh pricing',
        'Traffic declined', 'content', 5, 5, 2, 3, 0.8, 10, 'accepted', 1
      )
    `;
    await sql`
      INSERT INTO growth_actions (
        id, project_id, recommendation_id, creation_key, fact_hash, title,
        description, category, priority_score, status, state_version, due_at,
        approved_at, started_at, implemented_at
      ) VALUES (
        ${actionId}, ${projectId}, ${recommendationId},
        ${`gm-action-${actionName}-${suffix}`}, ${"b".repeat(64)},
        'Refresh pricing', 'Ship the accepted change', 'content', 10,
        'implemented', 5, '2026-09-30T12:00:00.000Z',
        '2026-08-01T12:00:00.000Z', '2026-08-15T12:00:00.000Z',
        '2026-08-29T12:00:00.000Z'
      )
    `;
  }
  for (const name of ["a", "b"]) {
    await sql`
      INSERT INTO growth_change_events (
        id, project_id, creation_key, fact_hash, source, change_type,
        actor_type, actor_id, description, happened_at
      ) VALUES (
        ${`gm_change_${name}_${suffix}`}, ${projectId},
        ${`gm-change-${name}-${suffix}`}, ${name.repeat(64)}, 'manual',
        'content_updated', 'user', 'user_1', 'Changed the page',
        '2026-08-29T12:00:00.000Z'
      )
    `;
  }
  for (const actionName of actionNames) {
    await sql`
      INSERT INTO growth_action_changes (project_id, action_id, change_event_id)
      VALUES (
        ${projectId}, ${`gm_action_${actionName}_${suffix}`},
        ${`gm_change_a_${suffix}`}
      )
    `;
  }
  return { organizationId, projectId, runId };
}

function startInput(input: {
  suffix: string;
  projectId: string;
  actionName: string;
  planName: string;
  hashDigit: string;
  metricType?: "search_clicks" | "search_impressions";
}) {
  return {
    id: `gm_plan_${input.planName}_${input.suffix}`,
    projectId: input.projectId,
    actionId: `gm_action_${input.actionName}_${input.suffix}`,
    implementationChangeEventId: `gm_change_a_${input.suffix}`,
    factHash: input.hashDigit.repeat(64),
    expectedActionVersion: 5,
    anchorAt: "2026-08-29T12:00:00.000Z",
    anchorDate: "2026-08-29",
    reportTimezone: "Europe/London",
    baselineStart: "2026-08-01",
    baselineEnd: "2026-08-14",
    cooldownEnd: "2026-08-31",
    measurementStart: "2026-09-01",
    measurementEnd: "2026-09-14",
    longMeasurementEnd: null,
    comparisonMode: "preceding_period" as const,
    metrics: [
      {
        id: `gm_metric_${input.planName}_${input.suffix}`,
        metricType: input.metricType ?? ("search_clicks" as const),
        entityType: "url" as const,
        entityKey: "https://example.com/pricing",
        isPrimary: true,
      },
    ],
    eventId: `gm_start_event_${input.planName}_${input.suffix}`,
    eventFactHash: `${Number(input.hashDigit) + 1}`.repeat(64),
    actorType: "agent" as const,
    actorId: "growth-agent",
    note: "Start measurement",
  };
}

function observationInput(input: {
  suffix: string;
  projectId: string;
  planId: string;
  metricId: string;
  name: string;
  periodType: "baseline" | "measurement";
  hashDigit: string;
}) {
  return {
    id: `gm_observation_${input.name}_${input.suffix}`,
    projectId: input.projectId,
    measurementPlanId: input.planId,
    metricId: input.metricId,
    periodType: input.periodType,
    factHash: input.hashDigit.repeat(64),
    effectiveStart:
      input.periodType === "baseline" ? "2026-08-01" : "2026-09-01",
    effectiveEnd: input.periodType === "baseline" ? "2026-08-14" : "2026-09-14",
    value: input.periodType === "baseline" ? 100 : 125,
    completeness: 1,
    evidenceKind: "gsc_period" as const,
    evidenceRef: `gsc:${input.name}`,
    capturedAt: "2026-09-15T12:00:00.000Z",
  };
}

describePostgres("GrowthMeasurementsRepository Postgres", () => {
  beforeAll(async () => {
    sql = postgres(testUrl!, { max: 12 });
    ({ GrowthMeasurementsRepository: repo } =
      await import("./GrowthMeasurementsRepository"));
    ({ withPgClient } = await import("@/db"));
  });

  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("serializes concurrent Plan and Result drift without grafting children", async () => {
    const suffix = crypto.randomUUID();
    const source = await seedSource(suffix, ["winner"]);
    const starts = [
      startInput({
        suffix,
        projectId: source.projectId,
        actionName: "winner",
        planName: "a",
        hashDigit: "1",
      }),
      startInput({
        suffix,
        projectId: source.projectId,
        actionName: "winner",
        planName: "b",
        hashDigit: "3",
        metricType: "search_impressions",
      }),
    ] as const;

    try {
      const [tables] = await sql<
        [
          {
            plans: string | null;
            observations: string | null;
            results: string | null;
          },
        ]
      >`
        SELECT to_regclass('public.growth_measurement_plans') AS plans,
               to_regclass('public.growth_measurement_observations') AS observations,
               to_regclass('public.growth_measurement_results') AS results
      `;
      expect(tables).toEqual({
        plans: "growth_measurement_plans",
        observations: "growth_measurement_observations",
        results: "growth_measurement_results",
      });

      await Promise.all(
        starts.map((start) =>
          withPgClient(() => repo.startMeasurementGraph(start)),
        ),
      );
      const plan = await withPgClient(() =>
        repo.getPlanByAction(source.projectId, starts[0].actionId),
      );
      expect(plan).toBeDefined();
      if (!plan) throw new Error("Concurrent Measurement start had no winner");
      const winningStart = starts.find(
        (start) => start.factHash === plan.factHash,
      );
      expect(winningStart).toBeDefined();
      if (!winningStart) throw new Error("Plan winner has unknown fact hash");
      const graph = await withPgClient(() =>
        repo.getGraph(source.projectId, plan.id),
      );
      expect(graph?.metrics).toEqual([
        expect.objectContaining({
          id: winningStart.metrics[0].id,
          metricType: winningStart.metrics[0].metricType,
        }),
      ]);
      expect(graph?.implementationChangeEventId).toBe(
        winningStart.implementationChangeEventId,
      );
      expect(graph?.actionEvents).toHaveLength(1);

      const baseline = observationInput({
        suffix,
        projectId: source.projectId,
        planId: plan.id,
        metricId: winningStart.metrics[0].id,
        name: "baseline",
        periodType: "baseline",
        hashDigit: "5",
      });
      const measurement = observationInput({
        suffix,
        projectId: source.projectId,
        planId: plan.id,
        metricId: winningStart.metrics[0].id,
        name: "measurement",
        periodType: "measurement",
        hashDigit: "6",
      });
      await withPgClient(() => repo.recordMeasurementObservation(baseline));
      await withPgClient(() => repo.recordMeasurementObservation(measurement));
      const resultInputs = [
        {
          id: `gm_result_a_${suffix}`,
          factHash: "7".repeat(64),
          outcome: "positive" as const,
          changeId: `gm_change_b_${suffix}`,
          eventFactHash: "8".repeat(64),
        },
        {
          id: `gm_result_b_${suffix}`,
          factHash: "9".repeat(64),
          outcome: "negative" as const,
          changeId: `gm_change_b_${suffix}`,
          eventFactHash: "0".repeat(64),
        },
      ].map((result) => ({
        id: result.id,
        projectId: source.projectId,
        measurementPlanId: plan.id,
        measurementPlanFactHash: plan.factHash,
        actionId: starts[0].actionId,
        expectedActionVersion: 6,
        factHash: result.factHash,
        observationsHash: "c".repeat(64),
        observations: [
          { id: baseline.id, factHash: baseline.factHash },
          { id: measurement.id, factHash: measurement.factHash },
        ],
        outcome: result.outcome,
        confidence: 0.8,
        summary: `Concurrent ${result.outcome} result`,
        evaluatedAt: "2026-10-15T12:00:00.000Z",
        model: null,
        promptVersion: null,
        confoundingChangeEventIds: [result.changeId],
        eventId: `gm_final_event_${result.id}`,
        eventFactHash: result.eventFactHash,
        actorType: "agent" as const,
        actorId: "growth-agent",
        note: "Finalize measurement",
      }));

      await Promise.all(
        resultInputs.map((input) =>
          withPgClient(() => repo.finalizeMeasurementGraph(input)),
        ),
      );
      const resultGraph = await withPgClient(() =>
        repo.getGraph(source.projectId, plan.id),
      );
      const winningResult = resultInputs.find(
        (input) => input.factHash === resultGraph?.result?.factHash,
      );
      expect(winningResult).toBeDefined();
      expect(resultGraph?.result).toMatchObject({
        id: winningResult?.id,
        outcome: winningResult?.outcome,
      });
      expect(resultGraph?.confoundingChangeEventIds).toEqual(
        winningResult?.confoundingChangeEventIds,
      );
      expect(resultGraph?.plan.status).toBe("completed");
      expect(resultGraph?.actionEvents.at(-1)).toMatchObject({
        actionVersion: 7,
        fromStatus: "measuring",
        toStatus: "evaluated",
      });

      await sql`DELETE FROM growth_change_events WHERE id = ${winningResult!.confoundingChangeEventIds[0]}`;
      expect(
        await withPgClient(() =>
          repo.getResultByPlan(source.projectId, plan.id),
        ),
      ).toMatchObject({ id: winningResult?.id });
      expect(
        await withPgClient(() =>
          repo.listResultChangeIds(source.projectId, winningResult!.id),
        ),
      ).toEqual([]);
    } finally {
      await sql`DELETE FROM projects WHERE id = ${source.projectId}`;
      await sql`DELETE FROM organization WHERE id = ${source.organizationId}`;
    }
  }, 25_000);

  it("locks a Plan so a racing Observation is rejected or retried into the frozen set", async () => {
    const suffix = crypto.randomUUID();
    const source = await seedSource(suffix, ["race"]);
    const start = startInput({
      suffix,
      projectId: source.projectId,
      actionName: "race",
      planName: "race",
      hashDigit: "1",
    });
    try {
      await withPgClient(() => repo.startMeasurementGraph(start));
      const baseline = observationInput({
        suffix,
        projectId: source.projectId,
        planId: start.id,
        metricId: start.metrics[0].id,
        name: "race_baseline",
        periodType: "baseline",
        hashDigit: "3",
      });
      const measurement = observationInput({
        suffix,
        projectId: source.projectId,
        planId: start.id,
        metricId: start.metrics[0].id,
        name: "race_measurement",
        periodType: "measurement",
        hashDigit: "4",
      });
      await withPgClient(() => repo.recordMeasurementObservation(baseline));
      const buildFinalize = (
        facts: Array<{ id: string; factHash: string }>,
        observationsHash: string,
      ) => ({
        id: `gm_result_race_${suffix}`,
        projectId: source.projectId,
        measurementPlanId: start.id,
        measurementPlanFactHash: start.factHash,
        actionId: start.actionId,
        expectedActionVersion: 6,
        factHash: observationsHash,
        observationsHash,
        observations: facts,
        outcome: "positive" as const,
        confidence: 0.7,
        summary: "Race-safe result",
        evaluatedAt: "2026-10-15T12:00:00.000Z",
        model: null,
        promptVersion: null,
        confoundingChangeEventIds: [] as string[],
        eventId: `gm_final_race_${suffix}`,
        eventFactHash: "7".repeat(64),
        actorType: "system" as const,
        actorId: "growth-system",
        note: null,
      });

      await Promise.all([
        withPgClient(() =>
          repo.finalizeMeasurementGraph(
            buildFinalize(
              [{ id: baseline.id, factHash: baseline.factHash }],
              "5".repeat(64),
            ),
          ),
        ),
        withPgClient(() => repo.recordMeasurementObservation(measurement)),
      ]);

      let graph = await withPgClient(() =>
        repo.getGraph(source.projectId, start.id),
      );
      if (!graph?.result) {
        expect(graph?.plan.status).toBe("active");
        expect(graph?.observations.map(({ id }) => id)).toEqual([
          baseline.id,
          measurement.id,
        ]);
        await withPgClient(() =>
          repo.finalizeMeasurementGraph(
            buildFinalize(
              [
                { id: baseline.id, factHash: baseline.factHash },
                { id: measurement.id, factHash: measurement.factHash },
              ],
              "6".repeat(64),
            ),
          ),
        );
        graph = await withPgClient(() =>
          repo.getGraph(source.projectId, start.id),
        );
      }
      expect(graph?.plan.status).toBe("completed");
      expect(graph?.result).toBeDefined();
      const storedObservationIds =
        graph?.observations.map(({ id }) => id) ?? [];
      expect(storedObservationIds).toContain(baseline.id);
      if (storedObservationIds.includes(measurement.id)) {
        expect(graph?.result?.observationsHash).toBe("6".repeat(64));
      } else {
        expect(graph?.result?.observationsHash).toBe("5".repeat(64));
      }
    } finally {
      await sql`DELETE FROM projects WHERE id = ${source.projectId}`;
      await sql`DELETE FROM organization WHERE id = ${source.organizationId}`;
    }
  }, 25_000);
});
