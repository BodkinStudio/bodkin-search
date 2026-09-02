/* eslint-disable max-lines -- the live-provider approval fixture keeps transaction evidence together */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthActionsRepository as RepositoryExport } from "./GrowthActionsRepository";
import type { GrowthInvestigationsService as InvestigationsExport } from "../services/GrowthInvestigationsService";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

type Repository = typeof RepositoryExport;
type Investigations = typeof InvestigationsExport;
type WithPgClient = typeof withPgClientExport;
type Approval = Awaited<ReturnType<Investigations["approveInvestigation"]>>;

let sql: ReturnType<typeof postgres>;
let GrowthActionsRepository: Repository;
let GrowthInvestigationsService: Investigations;
let withPgClient: WithPgClient;

const describePostgres = testUrl ? describe : describe.skip;
const templateVersion = "priority-page-investigation-v1";

function ids(suffix: string) {
  return {
    organizationId: `growth_approval_org_${suffix}`,
    projectId: `growth_approval_project_${suffix}`,
    runId: `growth_approval_run_${suffix}`,
    signalId: `growth_approval_signal_${suffix}`,
    insightId: `growth_approval_insight_${suffix}`,
    recommendationId: `growth_approval_recommendation_${suffix}`,
  };
}

function keys(signalId: string) {
  return {
    insight: `${templateVersion}:insight:${signalId}`,
    recommendation: `${templateVersion}:recommendation:${signalId}`,
    action: `${templateVersion}:action:${signalId}`,
  };
}

async function seedInvestigation(input: {
  suffix: string;
  status?: "proposed" | "accepted" | "snoozed";
  reviewVersion?: number;
}) {
  const value = ids(input.suffix);
  const sourceKeys = keys(value.signalId);
  await sql`
    INSERT INTO organization (id, name, slug, created_at)
    VALUES (${value.organizationId}, 'Growth approval test', ${`growth-approval-${input.suffix}`}, now())
  `;
  await sql`
    INSERT INTO projects (id, organization_id, name, domain)
    VALUES (${value.projectId}, ${value.organizationId}, 'Growth approval test', 'example.com')
  `;
  await sql`
    INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, completed_at, detector_version, analysis_version
    ) VALUES (
      ${value.runId}, ${value.projectId}, 'manual_analysis', 'manual', 'completed',
      ${`priority-page-check:${input.suffix}`}, '2026-08-01', '2026-08-29',
      '2026-08-29T10:00:00.000Z', '2026-08-29T10:01:00.000Z',
      'priority-page-click-decline-v1', ${templateVersion}
    )
  `;
  await sql`
    INSERT INTO growth_signals (
      id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
      severity, confidence, period_start, period_end, baseline_value,
      current_value, delta_value, evidence_kind, evidence_ref, captured_at
    ) VALUES (
      ${value.signalId}, ${value.projectId}, ${value.runId},
      'priority_page_click_decline', 'key_page', 'page_1', 'gsc_clicks',
      'warning', 0, '2026-08-01', '2026-08-29', 10, 5, -5, 'gsc_period',
      'saved', '2026-08-30T10:00:00.000Z'
    )
  `;
  await sql`
    INSERT INTO growth_insights (
      id, project_id, run_id, creation_key, fact_hash, title, explanation,
      hypothesis, confidence
    ) VALUES (
      ${value.insightId}, ${value.projectId}, ${value.runId}, ${sourceKeys.insight},
      ${"1".repeat(64)}, 'Observed decline', 'Observed facts.', 'Cause unknown.', 0
    )
  `;
  await sql`
    INSERT INTO growth_insight_signals (project_id, run_id, insight_id, signal_id)
    VALUES (${value.projectId}, ${value.runId}, ${value.insightId}, ${value.signalId})
  `;
  await sql`
    INSERT INTO growth_recommendations (
      id, project_id, run_id, creation_key, fact_hash, title, rationale,
      category, impact, commercial_relevance, effort, urgency, confidence,
      priority_score, status, review_version, snoozed_until, reviewed_at
    ) VALUES (
      ${value.recommendationId}, ${value.projectId}, ${value.runId},
      ${sourceKeys.recommendation}, ${"2".repeat(64)},
      'Investigate decline', 'Review the saved evidence.', 'investigation',
      1, 1, 1, 1, 0, 0, ${input.status ?? "proposed"}, ${input.reviewVersion ?? 0},
      ${input.status === "snoozed" ? "2099-09-04T00:00:00.000Z" : null},
      ${input.status === "snoozed" ? "2026-09-01T10:00:00.000Z" : null}
    )
  `;
  await sql`
    INSERT INTO growth_recommendation_insights (project_id, run_id, recommendation_id, insight_id)
    VALUES (${value.projectId}, ${value.runId}, ${value.recommendationId}, ${value.insightId})
  `;
  await sql`
    INSERT INTO growth_recommendation_targets (
      project_id, run_id, recommendation_id, target_type, target_value
    ) VALUES (
      ${value.projectId}, ${value.runId}, ${value.recommendationId}, 'url',
      'https://example.com/pricing'
    )
  `;
  await sql`
    INSERT INTO growth_recommendation_steps (
      project_id, run_id, recommendation_id, position, content
    ) VALUES (
      ${value.projectId}, ${value.runId}, ${value.recommendationId}, 0,
      'Review the saved evidence.'
    )
  `;
  return value;
}

async function deleteFixture(value: ReturnType<typeof ids>) {
  await sql`DELETE FROM projects WHERE id = ${value.projectId}`;
  await sql`DELETE FROM organization WHERE id = ${value.organizationId}`;
}

function approvalInput(value: ReturnType<typeof ids>, overrides = {}) {
  return {
    id: `growth_approval_action_${value.signalId}`,
    projectId: value.projectId,
    runId: value.runId,
    recommendationId: value.recommendationId,
    creationKey: keys(value.signalId).action,
    factHash: "3".repeat(64),
    title: "Investigate decline",
    description: "Review the saved evidence.",
    dueAt: "2026-09-04T00:00:00.000Z",
    category: "investigation",
    priorityScore: 0,
    targets: [
      {
        targetType: "url" as const,
        targetValue: "https://example.com/pricing",
      },
    ],
    eventId: `growth_approval_event_${value.signalId}`,
    eventFactHash: "4".repeat(64),
    actorType: "user" as const,
    actorId: "reviewer_1",
    note: null,
    expectedReviewVersion: 0,
    ...overrides,
  };
}

beforeAll(async () => {
  if (!testUrl) return;
  // TEST_POSTGRES_DATABASE_URL explicitly opts into a disposable migrated DB.
  // This test never creates, drops, migrates, or truncates databases.
  sql = postgres(testUrl, { max: 10 });
  ({ GrowthActionsRepository } = await import("./GrowthActionsRepository"));
  ({ GrowthInvestigationsService } =
    await import("../services/GrowthInvestigationsService"));
  ({ withPgClient } = await import("@/db"));
});

afterAll(async () => {
  if (testUrl) await sql.end({ timeout: 5 });
});

describePostgres("Growth approval Postgres transaction guards", () => {
  it("rolls back a proposed approval when event insertion fails", async () => {
    const value = await seedInvestigation({ suffix: crypto.randomUUID() });
    try {
      await expect(
        withPgClient(() =>
          GrowthActionsRepository.approveActionGraph(
            approvalInput(value, { eventFactHash: "not-a-fact-hash" }),
          ),
        ),
      ).rejects.toThrow();

      const [recommendation, actionCount, targetCount, eventCount] =
        await Promise.all([
          sql`SELECT status FROM growth_recommendations WHERE id = ${value.recommendationId}`,
          sql`SELECT count(*)::int AS count FROM growth_actions WHERE recommendation_id = ${value.recommendationId}`,
          sql`SELECT count(*)::int AS count FROM growth_action_targets WHERE project_id = ${value.projectId}`,
          sql`SELECT count(*)::int AS count FROM growth_action_events WHERE project_id = ${value.projectId}`,
        ]);
      expect(recommendation).toEqual([{ status: "proposed" }]);
      expect(actionCount).toEqual([{ count: 0 }]);
      expect(targetCount).toEqual([{ count: 0 }]);
      expect(eventCount).toEqual([{ count: 0 }]);
    } finally {
      await deleteFixture(value);
    }
  });

  it("does not accept stale sources or sources whose action key belongs to another graph", async () => {
    const stale = await seedInvestigation({
      suffix: crypto.randomUUID(),
      reviewVersion: 2,
    });
    const candidate = await seedInvestigation({ suffix: crypto.randomUUID() });
    const occupiedRecommendationId = `growth_approval_occupied_${candidate.signalId}`;
    try {
      await withPgClient(() =>
        GrowthActionsRepository.approveActionGraph(approvalInput(stale)),
      );
      await sql`
        INSERT INTO growth_recommendations (
          id, project_id, run_id, creation_key, fact_hash, title, rationale,
          category, impact, commercial_relevance, effort, urgency, confidence,
          priority_score, status, review_version
        ) VALUES (
          ${occupiedRecommendationId}, ${candidate.projectId}, ${candidate.runId},
          ${`occupied:${candidate.signalId}`}, ${"6".repeat(64)},
          'Occupied action source', 'A separate accepted source.', 'investigation',
          1, 1, 1, 1, 0, 0, 'accepted', 1
        )
      `;
      await sql`
        INSERT INTO growth_recommendation_targets (
          project_id, run_id, recommendation_id, target_type, target_value
        ) VALUES (
          ${candidate.projectId}, ${candidate.runId}, ${occupiedRecommendationId},
          'url', 'https://example.com/pricing'
        )
      `;
      await withPgClient(() =>
        GrowthActionsRepository.createActionGraph({
          ...approvalInput(candidate, {
            id: `growth_approval_occupied_action_${candidate.signalId}`,
            recommendationId: occupiedRecommendationId,
            eventId: `growth_approval_occupied_event_${candidate.signalId}`,
          }),
          creationKey: keys(candidate.signalId).action,
        }),
      );
      await withPgClient(() =>
        GrowthActionsRepository.approveActionGraph(approvalInput(candidate)),
      );

      const rows = await sql`
        SELECT id, status FROM growth_recommendations
        WHERE id IN (${stale.recommendationId}, ${candidate.recommendationId})
        ORDER BY id
      `;
      expect(rows).toEqual(
        [
          { id: candidate.recommendationId, status: "proposed" },
          { id: stale.recommendationId, status: "proposed" },
        ].toSorted((a, b) => a.id.localeCompare(b.id)),
      );
      expect(
        await withPgClient(() =>
          GrowthActionsRepository.getActionByKey(
            candidate.projectId,
            keys(candidate.signalId).action,
          ),
        ),
      ).toMatchObject({ recommendationId: occupiedRecommendationId });
    } finally {
      await Promise.all([deleteFixture(stale), deleteFixture(candidate)]);
    }
  });
});

describePostgres("Growth approval Postgres races and saved Work", () => {
  it("serializes concurrent approval dates and preserves the winning actor", async () => {
    const value = await seedInvestigation({ suffix: crypto.randomUUID() });
    const sameDate = await seedInvestigation({ suffix: crypto.randomUUID() });
    const base = { projectId: value.projectId, signalId: value.signalId };
    try {
      const attempts = await Promise.allSettled([
        withPgClient(() =>
          GrowthInvestigationsService.approveInvestigation({
            ...base,
            dueOn: "2026-09-04",
            actorId: "reviewer_a",
          }),
        ),
        withPgClient(() =>
          GrowthInvestigationsService.approveInvestigation({
            ...base,
            dueOn: "2026-09-05",
            actorId: "reviewer_b",
          }),
        ),
      ]);
      const winner = attempts.find(
        (attempt): attempt is PromiseFulfilledResult<Approval> =>
          attempt.status === "fulfilled",
      );
      expect(winner).toBeDefined();
      if (!winner) throw new Error("Concurrent approval had no winner");
      expect(
        attempts.filter((attempt) => attempt.status === "rejected"),
      ).toHaveLength(1);
      expect(winner.value.dueOn).toMatch(/2026-09-0[45]/);
      const winnerActor =
        winner.value.dueOn === "2026-09-04" ? "reviewer_a" : "reviewer_b";
      await expect(
        withPgClient(() =>
          GrowthInvestigationsService.approveInvestigation({
            ...base,
            dueOn: winner.value.dueOn!,
            actorId: "reviewer_c",
          }),
        ),
      ).resolves.toEqual(winner.value);

      const [events, recommendations] = await Promise.all([
        sql`SELECT actor_id FROM growth_action_events WHERE project_id = ${value.projectId}`,
        sql`SELECT status FROM growth_recommendations WHERE id = ${value.recommendationId}`,
      ]);
      expect(events).toHaveLength(1);
      expect(events).toEqual([{ actor_id: winnerActor }]);
      expect(recommendations).toEqual([{ status: "accepted" }]);

      const sameDateBase = {
        projectId: sameDate.projectId,
        signalId: sameDate.signalId,
        dueOn: "2026-09-06",
      };
      const sameDateResults = await Promise.all([
        withPgClient(() =>
          GrowthInvestigationsService.approveInvestigation({
            ...sameDateBase,
            actorId: "reviewer_d",
          }),
        ),
        withPgClient(() =>
          GrowthInvestigationsService.approveInvestigation({
            ...sameDateBase,
            actorId: "reviewer_e",
          }),
        ),
      ]);
      expect(sameDateResults[0]).toEqual(sameDateResults[1]);
      const sameDateEvents = await sql`
        SELECT actor_id FROM growth_action_events WHERE project_id = ${sameDate.projectId}
      `;
      expect(sameDateEvents).toHaveLength(1);
      expect(sameDateEvents[0]?.actor_id).toMatch(/^reviewer_[de]$/);
    } finally {
      await Promise.all([deleteFixture(value), deleteFixture(sameDate)]);
    }
  }, 15_000);

  it("rejects legacy accepted orphans and executes deduplicated, project-scoped Work", async () => {
    const orphan = await seedInvestigation({
      suffix: crypto.randomUUID(),
      status: "accepted",
      reviewVersion: 1,
    });
    const work = await seedInvestigation({
      suffix: crypto.randomUUID(),
      status: "accepted",
      reviewVersion: 1,
    });
    const foreign = await seedInvestigation({
      suffix: crypto.randomUUID(),
      status: "accepted",
      reviewVersion: 1,
    });
    try {
      await expect(
        withPgClient(() =>
          GrowthInvestigationsService.approveInvestigation({
            projectId: orphan.projectId,
            signalId: orphan.signalId,
            dueOn: "2026-09-04",
            actorId: "reviewer",
          }),
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      await withPgClient(() =>
        GrowthActionsRepository.createActionGraph(approvalInput(work)),
      );
      await withPgClient(() =>
        GrowthActionsRepository.createActionGraph(approvalInput(foreign)),
      );
      const duplicateInsightId = `growth_approval_duplicate_${work.signalId}`;
      await sql`
        INSERT INTO growth_insights (id, project_id, run_id, creation_key, fact_hash, title, explanation, hypothesis, confidence)
        VALUES (${duplicateInsightId}, ${work.projectId}, ${work.runId}, ${`${templateVersion}:insight:duplicate:${work.signalId}`}, ${"5".repeat(64)}, 'Duplicate link', 'Observed facts.', 'Cause unknown.', 0)
      `;
      await sql`
        INSERT INTO growth_insight_signals (project_id, run_id, insight_id, signal_id)
        VALUES (${work.projectId}, ${work.runId}, ${duplicateInsightId}, ${work.signalId})
      `;
      await sql`
        INSERT INTO growth_recommendation_insights (project_id, run_id, recommendation_id, insight_id)
        VALUES (${work.projectId}, ${work.runId}, ${work.recommendationId}, ${duplicateInsightId})
      `;
      const newerSignalId = `growth_approval_newer_${work.signalId}`;
      const newerInsightId = `growth_approval_newer_insight_${work.signalId}`;
      const newerRecommendationId = `growth_approval_newer_recommendation_${work.signalId}`;
      await sql`
        INSERT INTO growth_signals (id, project_id, run_id, signal_type, entity_type, entity_ref, metric, severity, confidence, period_start, period_end, baseline_value, current_value, delta_value, evidence_kind, evidence_ref, captured_at)
        VALUES (${newerSignalId}, ${work.projectId}, ${work.runId}, 'priority_page_click_decline', 'key_page', 'newer_page', 'gsc_clicks', 'warning', 0, '2026-08-01', '2026-08-29', 10, 5, -5, 'gsc_period', 'saved', '2026-08-30T10:00:00.000Z')
      `;
      await sql`
        INSERT INTO growth_insights (id, project_id, run_id, creation_key, fact_hash, title, explanation, hypothesis, confidence)
        VALUES (${newerInsightId}, ${work.projectId}, ${work.runId}, ${keys(newerSignalId).insight}, ${"a".repeat(64)}, 'Newer decline', 'Observed facts.', 'Cause unknown.', 0)
      `;
      await sql`
        INSERT INTO growth_insight_signals (project_id, run_id, insight_id, signal_id)
        VALUES (${work.projectId}, ${work.runId}, ${newerInsightId}, ${newerSignalId})
      `;
      await sql`
        INSERT INTO growth_recommendations (id, project_id, run_id, creation_key, fact_hash, title, rationale, category, impact, commercial_relevance, effort, urgency, confidence, priority_score, status, review_version)
        VALUES (${newerRecommendationId}, ${work.projectId}, ${work.runId}, ${keys(newerSignalId).recommendation}, ${"b".repeat(64)}, 'Newer investigation', 'Review the saved evidence.', 'investigation', 1, 1, 1, 1, 0, 0, 'accepted', 1)
      `;
      await sql`
        INSERT INTO growth_recommendation_insights (project_id, run_id, recommendation_id, insight_id)
        VALUES (${work.projectId}, ${work.runId}, ${newerRecommendationId}, ${newerInsightId})
      `;
      await sql`
        INSERT INTO growth_recommendation_targets (project_id, run_id, recommendation_id, target_type, target_value)
        VALUES (${work.projectId}, ${work.runId}, ${newerRecommendationId}, 'url', 'https://example.com/newer')
      `;
      const newerActionId = `growth_approval_newer_action_${work.signalId}`;
      await withPgClient(() =>
        GrowthActionsRepository.createActionGraph(
          approvalInput(work, {
            id: newerActionId,
            recommendationId: newerRecommendationId,
            creationKey: keys(newerSignalId).action,
            eventId: `growth_approval_newer_event_${work.signalId}`,
            factHash: "c".repeat(64),
            eventFactHash: "d".repeat(64),
            title: "Newer investigation",
            dueAt: "2026-09-05T00:00:00.000Z",
            targets: [
              {
                targetType: "url" as const,
                targetValue: "https://example.com/newer",
              },
            ],
          }),
        ),
      );

      const [workRows, foreignRows] = await Promise.all([
        withPgClient(() =>
          GrowthActionsRepository.listInvestigationWork(work.projectId, 50),
        ),
        withPgClient(() =>
          GrowthActionsRepository.listInvestigationWork(foreign.projectId, 50),
        ),
      ]);
      expect(workRows).toEqual([
        expect.objectContaining({ id: newerActionId, runId: work.runId }),
        expect.objectContaining({
          id: approvalInput(work).id,
          runId: work.runId,
        }),
      ]);
      expect(foreignRows).toEqual([
        expect.objectContaining({ runId: foreign.runId }),
      ]);
      expect(workRows).toHaveLength(2);
      const newestOnly = await withPgClient(() =>
        GrowthActionsRepository.listInvestigationWork(work.projectId, 1),
      );
      expect(newestOnly).toEqual([
        expect.objectContaining({ id: newerActionId, stateVersion: 0 }),
      ]);
      await expect(
        withPgClient(() =>
          GrowthActionsRepository.listInvestigationWork(
            work.projectId,
            1,
            approvalInput(work).id,
          ),
        ),
      ).resolves.toEqual([
        expect.objectContaining({
          id: approvalInput(work).id,
          runId: work.runId,
          stateVersion: 0,
        }),
      ]);
      await expect(
        withPgClient(() =>
          GrowthActionsRepository.listInvestigationWork(
            work.projectId,
            1,
            "missing_action",
          ),
        ),
      ).resolves.toEqual([]);
      // The original qualified Action has fallen outside the one-item Work
      // list, but exact-ID scope remains independently source-qualified.
      await expect(
        withPgClient(() =>
          GrowthActionsRepository.listInvestigationWork(
            work.projectId,
            1,
            approvalInput(work).id,
          ),
        ),
      ).resolves.toHaveLength(1);
      expect(
        await withPgClient(() =>
          GrowthActionsRepository.listInvestigationWork(orphan.projectId, 50),
        ),
      ).toEqual([]);
    } finally {
      await Promise.all([
        deleteFixture(orphan),
        deleteFixture(work),
        deleteFixture(foreign),
      ]);
    }
  });
});

describePostgres(
  "Growth investigation review Postgres transaction guards",
  () => {
    it.each([
      {
        label: "dismissal",
        review: {
          decision: "dismiss" as const,
          dismissalReason: "already_planned" as const,
        },
        status: "dismissed",
      },
      {
        label: "snooze",
        review: { decision: "snooze" as const, snoozeUntil: "2099-09-04" },
        status: "snoozed",
      },
    ])(
      "allows exactly one concurrent proposed approval or $label decision",
      async ({ review, status }) => {
        const value = await seedInvestigation({ suffix: crypto.randomUUID() });
        try {
          const decisions = await Promise.allSettled([
            withPgClient(() =>
              GrowthInvestigationsService.approveInvestigation({
                projectId: value.projectId,
                signalId: value.signalId,
                dueOn: "2026-09-07",
                actorId: "reviewer",
              }),
            ),
            withPgClient(() =>
              GrowthInvestigationsService.reviewInvestigation({
                projectId: value.projectId,
                signalId: value.signalId,
                expectedVersion: 0,
                ...review,
              }),
            ),
          ]);
          expect(
            decisions.filter((decision) => decision.status === "fulfilled"),
          ).toHaveLength(1);
          expect(
            decisions.filter((decision) => decision.status === "rejected"),
          ).toHaveLength(1);
          const rejected = decisions.find(
            (decision): decision is PromiseRejectedResult =>
              decision.status === "rejected",
          );
          expect(rejected?.reason).toMatchObject({ code: "CONFLICT" });

          const [recommendation] = await sql`
        SELECT status, review_version, dismissal_reason, snoozed_until
        FROM growth_recommendations WHERE id = ${value.recommendationId}
      `;
          expect(recommendation?.review_version).toBe(1);
          const action = await withPgClient(() =>
            GrowthActionsRepository.getActionByKey(
              value.projectId,
              keys(value.signalId).action,
            ),
          );
          if (recommendation?.status === "accepted") {
            expect(recommendation.dismissal_reason).toBeNull();
            expect(recommendation.snoozed_until).toBeNull();
            expect(action).toBeDefined();
            if (!action) throw new Error("Approved decision had no Action");
            const graph = await withPgClient(() =>
              GrowthActionsRepository.getActionGraph(
                value.projectId,
                action.id,
              ),
            );
            expect(graph?.targets).toHaveLength(1);
            expect(graph?.events).toHaveLength(1);
          } else {
            expect(recommendation?.status).toBe(status);
            expect(recommendation?.dismissal_reason).toBe(
              status === "dismissed" ? "already_planned" : null,
            );
            expect(recommendation?.snoozed_until).toBe(
              status === "snoozed" ? "2099-09-04T00:00:00.000Z" : null,
            );
            expect(action).toBeNull();
            const [targetCount, eventCount] = await Promise.all([
              sql`SELECT count(*)::int AS count FROM growth_action_targets WHERE project_id = ${value.projectId}`,
              sql`SELECT count(*)::int AS count FROM growth_action_events WHERE project_id = ${value.projectId}`,
            ]);
            expect(targetCount).toEqual([{ count: 0 }]);
            expect(eventCount).toEqual([{ count: 0 }]);
          }
        } finally {
          await deleteFixture(value);
        }
      },
      15_000,
    );

    it("returns a snoozed investigation to review without allowing approval", async () => {
      const value = await seedInvestigation({
        suffix: crypto.randomUUID(),
        status: "snoozed",
        reviewVersion: 1,
      });
      try {
        await expect(
          withPgClient(() =>
            GrowthInvestigationsService.approveInvestigation({
              projectId: value.projectId,
              signalId: value.signalId,
              dueOn: "2026-09-07",
              actorId: "reviewer",
            }),
          ),
        ).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(
          withPgClient(() =>
            GrowthInvestigationsService.reviewInvestigation({
              projectId: value.projectId,
              signalId: value.signalId,
              expectedVersion: 1,
              decision: "review_now",
            }),
          ),
        ).resolves.toMatchObject({ status: "proposed", reviewVersion: 2 });

        const [recommendation] = await sql`
        SELECT status, review_version, snoozed_until, reviewed_at
        FROM growth_recommendations WHERE id = ${value.recommendationId}
      `;
        expect(recommendation).toMatchObject({
          status: "proposed",
          review_version: 2,
          snoozed_until: null,
          reviewed_at: null,
        });
        expect(
          await withPgClient(() =>
            GrowthActionsRepository.getActionByKey(
              value.projectId,
              keys(value.signalId).action,
            ),
          ),
        ).toBeNull();
        const [targetCount, eventCount] = await Promise.all([
          sql`SELECT count(*)::int AS count FROM growth_action_targets WHERE project_id = ${value.projectId}`,
          sql`SELECT count(*)::int AS count FROM growth_action_events WHERE project_id = ${value.projectId}`,
        ]);
        expect(targetCount).toEqual([{ count: 0 }]);
        expect(eventCount).toEqual([{ count: 0 }]);
      } finally {
        await deleteFixture(value);
      }
    }, 15_000);
  },
);
