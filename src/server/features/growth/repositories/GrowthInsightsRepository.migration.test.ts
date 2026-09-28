/* eslint-disable max-lines, max-lines-per-function -- exhaustive migration acceptance is easier to audit as one sequential fixture */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const legacyMigration = readFileSync("drizzle/0044_glossy_komodo.sql", "utf8");
const insightMigrations = [
  readFileSync("drizzle/0045_mean_retro_girl.sql", "utf8"),
  readFileSync("drizzle/0052_lethal_brother_voodoo.sql", "utf8"),
];
const insightMigrationSql = insightMigrations.join("\n");
const factHash = "a".repeat(64);

let client: Client;

async function insertRun(projectId: string, id: string, slot: string) {
  await client.execute({
    sql: `INSERT INTO growth_runs (
      id, project_id, run_type, trigger, status, cadence_slot, period_start,
      period_end, started_at, detector_version
    ) VALUES (?, ?, 'daily_monitor', 'manual', 'running', ?, '2026-08-01',
      '2026-08-29', '2026-08-29T10:00:00.000Z', 'detector-v1')`,
    args: [id, projectId, slot],
  });
}

async function insertSignal(projectId: string, runId: string, id: string) {
  await client.execute({
    sql: `INSERT INTO growth_signals (
      id, project_id, run_id, signal_type, entity_type, entity_ref, metric,
      severity, confidence, period_start, period_end, baseline_value,
      current_value, delta_value, evidence_kind, evidence_ref, captured_at
    ) VALUES (?, ?, ?, 'page_clicks_down', 'page',
      'https://example.test/pricing', 'clicks', 'warning', 0.5,
      '2026-08-01', '2026-08-29', 20, 10, -10, 'gsc_period',
      'gsc:2026-08', '2026-08-29T10:00:00.000Z')`,
    args: [id, projectId, runId],
  });
}

interface InsightInsert {
  id: string;
  projectId: string;
  runId: string;
  creationKey?: string;
  confidence?: number | null;
  model?: string | null;
  promptVersion?: string | null;
}

async function insertInsight({
  id,
  projectId,
  runId,
  creationKey = id,
  confidence = 0.5,
  model = null,
  promptVersion = null,
}: InsightInsert) {
  await client.execute({
    sql: `INSERT INTO growth_insights (
      id, project_id, run_id, creation_key, fact_hash, title, explanation,
      hypothesis, confidence, model, prompt_version
    ) VALUES (?, ?, ?, ?, ?, 'Clicks fell', 'Clicks fell during the period',
      'Commercial visibility declined', ?, ?, ?)`,
    args: [
      id,
      projectId,
      runId,
      creationKey,
      factHash,
      confidence,
      model,
      promptVersion,
    ],
  });
}

interface RecommendationInsert {
  id: string;
  projectId: string;
  runId: string;
  creationKey?: string;
  impact?: number | null;
  commercialRelevance?: number | null;
  effort?: number | null;
  urgency?: number | null;
  confidence?: number | null;
  priorityScore?: number | null;
  model?: string | null;
  promptVersion?: string | null;
  status?: string;
  reviewVersion?: number;
  snoozedUntil?: string | null;
  dismissalReason?: string | null;
  resolutionRecommendationId?: string | null;
}

async function insertRecommendation({
  id,
  projectId,
  runId,
  creationKey = id,
  impact = 4,
  commercialRelevance = 5,
  effort = 2,
  urgency = 3,
  confidence = 0.5,
  priorityScore = 0,
  model = null,
  promptVersion = null,
  status = "proposed",
  reviewVersion = 0,
  snoozedUntil = null,
  dismissalReason = null,
  resolutionRecommendationId = null,
}: RecommendationInsert) {
  await client.execute({
    sql: `INSERT INTO growth_recommendations (
      id, project_id, run_id, creation_key, fact_hash, title, rationale,
      category, impact, commercial_relevance, effort, urgency, confidence,
      priority_score, model, prompt_version, status, review_version,
      snoozed_until, dismissal_reason, resolution_recommendation_id
    ) VALUES (?, ?, ?, ?, ?, 'Refresh the pricing page',
      'The page lost high-intent clicks', 'content_refresh', ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      projectId,
      runId,
      creationKey,
      factHash,
      impact,
      commercialRelevance,
      effort,
      urgency,
      confidence,
      priorityScore,
      model,
      promptVersion,
      status,
      reviewVersion,
      snoozedUntil,
      dismissalReason,
      resolutionRecommendationId,
    ],
  });
}

async function countRows(table: string, where: string) {
  const [row] = (
    await client.execute(
      `SELECT count(*) AS count FROM ${table} WHERE ${where}`,
    )
  ).rows;
  return Number(row?.count ?? 0);
}

beforeEach(async () => {
  client = createClient({ url: "file::memory:" });
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY);",
      "INSERT INTO projects (id) VALUES ('project_1'), ('project_2');",
      legacyMigration,
    ].join("\n"),
  );
  await insertRun("project_1", "run_1", "slot_1");
  await insertRun("project_1", "run_2", "slot_2");
  await insertRun("project_2", "run_3", "slot_3");
  await insertSignal("project_1", "run_1", "signal_1");
  await insertSignal("project_1", "run_2", "signal_2");
  await insertSignal("project_2", "run_3", "signal_3");
  for (const migration of insightMigrations) {
    await client.executeMultiple(migration);
  }
});

afterEach(() => client.close());

describe("Growth Insights and Recommendations D1 migrations", () => {
  it("adds a project-qualified immutable Signal decision ledger", async () => {
    await insertRecommendation({
      id: "recommendation_1",
      projectId: "project_1",
      runId: "run_1",
    });
    await client.execute(`INSERT INTO growth_recommendation_signal_links
      (project_id, signal_run_id, signal_id, dedupe_key, recommendation_id,
       relationship, suppression_reason, policy_version)
      VALUES ('project_1', 'run_1', 'signal_1', '${"d".repeat(64)}',
        'recommendation_1', 'controller', NULL, 'priority-page-v1')`);
    await expect(
      client.execute(`INSERT INTO growth_recommendation_signal_links
        (project_id, signal_run_id, signal_id, dedupe_key, recommendation_id,
         relationship, suppression_reason, policy_version)
        VALUES ('project_1', 'run_2', 'signal_2', '${"d".repeat(64)}',
        'recommendation_1', 'controller', NULL, 'priority-page-v1')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_recommendation_signal_links
        (project_id, signal_run_id, signal_id, dedupe_key, recommendation_id,
         relationship, suppression_reason, policy_version)
        VALUES ('project_1', 'run_2', 'signal_2', '${"d".repeat(64)}',
        'recommendation_1', 'suppressed', NULL, 'priority-page-v1')`),
    ).rejects.toThrow();
    await client.execute(`INSERT INTO growth_recommendation_signal_links
      (project_id, signal_run_id, signal_id, dedupe_key, recommendation_id,
       relationship, suppression_reason, policy_version)
      VALUES ('project_1', 'run_2', 'signal_2', '${"d".repeat(64)}',
        'recommendation_1', 'suppressed', 'existing_proposal',
        'priority-page-v1')`);
    await expect(
      client.execute(`DELETE FROM growth_recommendations
        WHERE project_id = 'project_1' AND id = 'recommendation_1'`),
    ).rejects.toThrow();
    await expect(
      client.execute(`DELETE FROM growth_runs
        WHERE project_id = 'project_1' AND id = 'run_1'`),
    ).rejects.toThrow();
    await client.execute(`DELETE FROM growth_signals
      WHERE project_id = 'project_1' AND run_id = 'run_2' AND id = 'signal_2'`);
    expect(
      await countRows(
        "growth_recommendation_signal_links",
        "project_id = 'project_1'",
      ),
    ).toBe(1);
    await expect(
      client.execute("DELETE FROM projects WHERE id = 'project_1'"),
    ).resolves.toBeDefined();
    expect(
      await countRows(
        "growth_recommendation_signal_links",
        "project_id = 'project_1'",
      ),
    ).toBe(0);
  });

  it("preserves populated Signals and adds the exact composite parent index without a rebuild", async () => {
    expect(insightMigrationSql).not.toMatch(
      /\b(?:DROP|ALTER)\s+TABLE\s+[`"]?growth_signals\b|\bRENAME\s+(?:TABLE\s+)?[`"]?growth_signals\b/i,
    );

    expect(
      (
        await client.execute(
          "SELECT id, project_id, run_id, baseline_value, current_value FROM growth_signals ORDER BY id",
        )
      ).rows,
    ).toEqual([
      {
        id: "signal_1",
        project_id: "project_1",
        run_id: "run_1",
        baseline_value: 20,
        current_value: 10,
      },
      {
        id: "signal_2",
        project_id: "project_1",
        run_id: "run_2",
        baseline_value: 20,
        current_value: 10,
      },
      {
        id: "signal_3",
        project_id: "project_2",
        run_id: "run_3",
        baseline_value: 20,
        current_value: 10,
      },
    ]);

    const indexList = (
      await client.execute("PRAGMA index_list('growth_signals')")
    ).rows;
    expect(indexList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "growth_signals_project_run_id_key",
          unique: 1,
        }),
      ]),
    );
    const indexColumns = (
      await client.execute(
        "PRAGMA index_info('growth_signals_project_run_id_key')",
      )
    ).rows
      .toSorted((left, right) => Number(left.seqno) - Number(right.seqno))
      .map((row) => row.name);
    expect(indexColumns).toEqual(["project_id", "run_id", "id"]);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("rejects Insight source links across projects or runs", async () => {
    await insertInsight({
      id: "insight_1",
      projectId: "project_1",
      runId: "run_1",
    });
    await insertInsight({
      id: "insight_2",
      projectId: "project_1",
      runId: "run_2",
    });
    await insertInsight({
      id: "insight_3",
      projectId: "project_2",
      runId: "run_3",
    });

    await expect(
      client.execute(`INSERT INTO growth_insight_signals
        (project_id, run_id, insight_id, signal_id)
        VALUES ('project_1', 'run_1', 'insight_1', 'signal_1')`),
    ).resolves.toBeDefined();
    await expect(
      client.execute(`INSERT INTO growth_insight_signals
        (project_id, run_id, insight_id, signal_id)
        VALUES ('project_1', 'run_1', 'insight_1', 'signal_2')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_insight_signals
        (project_id, run_id, insight_id, signal_id)
        VALUES ('project_1', 'run_1', 'insight_1', 'signal_3')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_insight_signals
        (project_id, run_id, insight_id, signal_id)
        VALUES ('project_2', 'run_3', 'insight_1', 'signal_3')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_insight_signals
        (project_id, run_id, insight_id, signal_id)
        VALUES ('project_1', 'run_1', 'insight_1', 'signal_1')`),
    ).rejects.toThrow();
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("rejects Recommendation source and normalized child rows outside their parent graph", async () => {
    await insertInsight({
      id: "insight_1",
      projectId: "project_1",
      runId: "run_1",
    });
    await insertInsight({
      id: "insight_2",
      projectId: "project_1",
      runId: "run_2",
    });
    await insertInsight({
      id: "insight_3",
      projectId: "project_2",
      runId: "run_3",
    });
    await insertRecommendation({
      id: "recommendation_1",
      projectId: "project_1",
      runId: "run_1",
    });

    await expect(
      client.execute(`INSERT INTO growth_recommendation_insights
        (project_id, run_id, recommendation_id, insight_id)
        VALUES ('project_1', 'run_1', 'recommendation_1', 'insight_1')`),
    ).resolves.toBeDefined();
    await expect(
      client.execute(`INSERT INTO growth_recommendation_insights
        (project_id, run_id, recommendation_id, insight_id)
        VALUES ('project_1', 'run_1', 'recommendation_1', 'insight_2')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_recommendation_insights
        (project_id, run_id, recommendation_id, insight_id)
        VALUES ('project_1', 'run_1', 'recommendation_1', 'insight_3')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_recommendation_insights
        (project_id, run_id, recommendation_id, insight_id)
        VALUES ('project_1', 'run_2', 'recommendation_1', 'insight_2')`),
    ).rejects.toThrow();

    await expect(
      client.execute(`INSERT INTO growth_recommendation_targets
        (project_id, run_id, recommendation_id, target_type, target_value)
        VALUES ('project_1', 'run_1', 'recommendation_1', 'url',
          'https://example.test/pricing')`),
    ).resolves.toBeDefined();
    await expect(
      client.execute(`INSERT INTO growth_recommendation_targets
        (project_id, run_id, recommendation_id, target_type, target_value)
        VALUES ('project_1', 'run_2', 'recommendation_1', 'url',
          'https://example.test/pricing')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_recommendation_targets
        (project_id, run_id, recommendation_id, target_type, target_value)
        VALUES ('project_1', 'run_1', 'recommendation_1', 'url',
          'https://example.test/pricing')`),
    ).rejects.toThrow();

    await expect(
      client.execute(`INSERT INTO growth_recommendation_steps
        (project_id, run_id, recommendation_id, position, content)
        VALUES ('project_1', 'run_1', 'recommendation_1', 0,
          'Audit the current page')`),
    ).resolves.toBeDefined();
    await expect(
      client.execute(`INSERT INTO growth_recommendation_steps
        (project_id, run_id, recommendation_id, position, content)
        VALUES ('project_2', 'run_3', 'recommendation_1', 1,
          'Draft the revised copy')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_recommendation_steps
        (project_id, run_id, recommendation_id, position, content)
        VALUES ('project_1', 'run_1', 'recommendation_1', 0,
          'A different step at the same position')`),
    ).rejects.toThrow();
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("enforces creation keys, score bounds, vocabularies and review metadata", async () => {
    await insertInsight({
      id: "insight_zero",
      projectId: "project_1",
      runId: "run_1",
      creationKey: "shared_key",
      confidence: 0,
    });
    await expect(
      insertInsight({
        id: "insight_duplicate",
        projectId: "project_1",
        runId: "run_1",
        creationKey: "shared_key",
      }),
    ).rejects.toThrow();
    await expect(
      insertInsight({
        id: "insight_same_key_other_run",
        projectId: "project_1",
        runId: "run_2",
        creationKey: "shared_key",
        confidence: 1,
      }),
    ).resolves.toBeUndefined();
    await expect(
      insertInsight({
        id: "insight_bad_confidence",
        projectId: "project_1",
        runId: "run_1",
        confidence: 1.01,
      }),
    ).rejects.toThrow();
    await expect(
      insertInsight({
        id: "insight_null_confidence",
        projectId: "project_1",
        runId: "run_1",
        confidence: null,
      }),
    ).rejects.toThrow();
    await expect(
      insertInsight({
        id: "insight_unpaired_model",
        projectId: "project_1",
        runId: "run_1",
        model: "gpt-5",
      }),
    ).rejects.toThrow();

    await insertRecommendation({
      id: "recommendation_zero",
      projectId: "project_1",
      runId: "run_1",
      creationKey: "shared_key",
      confidence: 0,
      priorityScore: 0,
    });
    await expect(
      insertRecommendation({
        id: "recommendation_duplicate",
        projectId: "project_1",
        runId: "run_1",
        creationKey: "shared_key",
      }),
    ).rejects.toThrow();
    await expect(
      insertRecommendation({
        id: "recommendation_bad_score",
        projectId: "project_1",
        runId: "run_1",
        impact: 0,
      }),
    ).rejects.toThrow();
    await expect(
      insertRecommendation({
        id: "recommendation_fractional_score",
        projectId: "project_1",
        runId: "run_1",
        impact: 1.5,
      }),
    ).rejects.toThrow();
    await expect(
      insertRecommendation({
        id: "recommendation_negative_priority",
        projectId: "project_1",
        runId: "run_1",
        priorityScore: -1,
      }),
    ).rejects.toThrow();
    await expect(
      insertRecommendation({
        id: "recommendation_null_priority",
        projectId: "project_1",
        runId: "run_1",
        priorityScore: null,
      }),
    ).rejects.toThrow();
    await expect(
      insertRecommendation({
        id: "recommendation_unpaired_prompt",
        projectId: "project_1",
        runId: "run_1",
        promptVersion: "growth-v1",
      }),
    ).rejects.toThrow();
    await expect(
      insertRecommendation({
        id: "recommendation_bad_dismissal",
        projectId: "project_1",
        runId: "run_1",
        status: "dismissed",
        dismissalReason: "not_now",
      }),
    ).rejects.toThrow();
    await expect(
      insertRecommendation({
        id: "recommendation_missing_snooze",
        projectId: "project_1",
        runId: "run_1",
        status: "snoozed",
      }),
    ).rejects.toThrow();
    await expect(
      insertRecommendation({
        id: "recommendation_negative_version",
        projectId: "project_1",
        runId: "run_1",
        reviewVersion: -1,
      }),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_recommendation_targets
        (project_id, run_id, recommendation_id, target_type, target_value)
        VALUES ('project_1', 'run_1', 'recommendation_zero', 'page',
          'https://example.test/pricing')`),
    ).rejects.toThrow();
    await expect(
      client.execute(`INSERT INTO growth_recommendation_steps
        (project_id, run_id, recommendation_id, position, content)
        VALUES ('project_1', 'run_1', 'recommendation_zero', 0.5,
          'Fractional order')`),
    ).rejects.toThrow();
  });

  it("only permits a non-self resolution Recommendation in the same project and run", async () => {
    await insertRecommendation({
      id: "recommendation_1",
      projectId: "project_1",
      runId: "run_1",
    });
    await insertRecommendation({
      id: "recommendation_2",
      projectId: "project_1",
      runId: "run_1",
    });
    await insertRecommendation({
      id: "recommendation_cross_run",
      projectId: "project_1",
      runId: "run_2",
    });
    await insertRecommendation({
      id: "recommendation_3",
      projectId: "project_2",
      runId: "run_3",
    });

    await expect(
      client.execute(`UPDATE growth_recommendations
        SET status = 'merged', resolution_recommendation_id = 'recommendation_1'
        WHERE id = 'recommendation_1'`),
    ).rejects.toThrow();
    await expect(
      client.execute(`UPDATE growth_recommendations
        SET status = 'merged', resolution_recommendation_id = 'recommendation_3'
        WHERE id = 'recommendation_1'`),
    ).rejects.toThrow();
    await expect(
      client.execute(`UPDATE growth_recommendations
        SET status = 'merged',
          resolution_recommendation_id = 'recommendation_cross_run'
        WHERE id = 'recommendation_1'`),
    ).rejects.toThrow();
    await expect(
      client.execute(`UPDATE growth_recommendations
        SET status = 'merged', resolution_recommendation_id = 'recommendation_2'
        WHERE id = 'recommendation_1'`),
    ).resolves.toBeDefined();
    expect(
      (
        await client.execute(`SELECT status, resolution_recommendation_id
          FROM growth_recommendations WHERE id = 'recommendation_1'`)
      ).rows[0],
    ).toMatchObject({
      status: "merged",
      resolution_recommendation_id: "recommendation_2",
    });
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("cascades the normalized graph by run and project without affecting other tenants", async () => {
    for (const [insightId, projectId, runId, signalId] of [
      ["insight_1", "project_1", "run_1", "signal_1"],
      ["insight_2", "project_1", "run_2", "signal_2"],
      ["insight_3", "project_2", "run_3", "signal_3"],
    ] as const) {
      await insertInsight({ id: insightId, projectId, runId });
      await client.execute({
        sql: `INSERT INTO growth_insight_signals
          (project_id, run_id, insight_id, signal_id) VALUES (?, ?, ?, ?)`,
        args: [projectId, runId, insightId, signalId],
      });
    }
    for (const [recommendationId, projectId, runId, insightId] of [
      ["recommendation_1", "project_1", "run_1", "insight_1"],
      ["recommendation_2", "project_1", "run_2", "insight_2"],
      ["recommendation_3", "project_2", "run_3", "insight_3"],
    ] as const) {
      await insertRecommendation({ id: recommendationId, projectId, runId });
      await client.execute({
        sql: `INSERT INTO growth_recommendation_insights
          (project_id, run_id, recommendation_id, insight_id)
          VALUES (?, ?, ?, ?)`,
        args: [projectId, runId, recommendationId, insightId],
      });
      await client.execute({
        sql: `INSERT INTO growth_recommendation_targets
          (project_id, run_id, recommendation_id, target_type, target_value)
          VALUES (?, ?, ?, 'keyword', 'commercial seo')`,
        args: [projectId, runId, recommendationId],
      });
      await client.execute({
        sql: `INSERT INTO growth_recommendation_steps
          (project_id, run_id, recommendation_id, position, content)
          VALUES (?, ?, ?, 0, 'Audit the page')`,
        args: [projectId, runId, recommendationId],
      });
    }
    await insertRecommendation({
      id: "recommendation_1_destination",
      projectId: "project_1",
      runId: "run_1",
    });
    await client.execute(`UPDATE growth_recommendations
      SET status = 'merged',
        resolution_recommendation_id = 'recommendation_1_destination'
      WHERE id = 'recommendation_1'`);

    await client.execute("DELETE FROM growth_runs WHERE id = 'run_1'");
    expect(await countRows("growth_insights", "id = 'insight_1'")).toBe(0);
    expect(
      await countRows("growth_recommendations", "id = 'recommendation_1'"),
    ).toBe(0);
    expect(
      await countRows(
        "growth_recommendations",
        "id = 'recommendation_1_destination'",
      ),
    ).toBe(0);
    expect(
      await countRows(
        "growth_recommendation_targets",
        "recommendation_id = 'recommendation_1'",
      ),
    ).toBe(0);
    expect(
      await countRows(
        "growth_recommendation_steps",
        "recommendation_id = 'recommendation_1'",
      ),
    ).toBe(0);
    expect(await countRows("growth_insights", "id = 'insight_2'")).toBe(1);

    await client.execute("DELETE FROM projects WHERE id = 'project_2'");
    expect(await countRows("growth_insights", "id = 'insight_3'")).toBe(0);
    expect(
      await countRows("growth_recommendations", "id = 'recommendation_3'"),
    ).toBe(0);
    expect(
      await countRows("growth_recommendations", "id = 'recommendation_2'"),
    ).toBe(1);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });
});
