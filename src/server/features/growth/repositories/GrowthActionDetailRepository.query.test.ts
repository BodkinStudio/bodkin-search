/* eslint-disable max-lines -- the bounded detail graph fixture is intentionally self-contained */
import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthActionDetailRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const PROJECT = "detail_project";
const FOREIGN = "detail_foreign";
const ACTION = "detail_action";
const AS_OF = "2026-06-01T12:00:00.000Z";
let client: Client;
let repository: typeof RepositoryModule.GrowthActionDetailRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY, domain text, archived_at text);",
      'CREATE TABLE "user" (id text PRIMARY KEY);',
      `INSERT INTO projects (id, domain) VALUES ('${PROJECT}', 'example.com'), ('${FOREIGN}', 'foreign.example');`,
      readFileSync("drizzle/0044_glossy_komodo.sql", "utf8"),
      readFileSync("drizzle/0045_mean_retro_girl.sql", "utf8"),
      readFileSync("drizzle/0046_living_misty_knight.sql", "utf8"),
      readFileSync("drizzle/0047_flaky_felicia_hardy.sql", "utf8"),
      `INSERT INTO growth_runs (id, project_id, run_type, trigger, status, cadence_slot, period_start, period_end, started_at, completed_at, detector_version)
      VALUES ('detail_run', '${PROJECT}', 'manual_analysis', 'manual', 'completed', 'detail', '2026-05-01', '2026-05-31', '2026-05-01T00:00:00.000Z', '2026-05-31T00:00:00.000Z', 'v1'),
      ('foreign_run', '${FOREIGN}', 'manual_analysis', 'manual', 'completed', 'foreign', '2026-05-01', '2026-05-31', '2026-05-01T00:00:00.000Z', '2026-05-31T00:00:00.000Z', 'v1');`,
      `INSERT INTO growth_recommendations (id, project_id, run_id, creation_key, fact_hash, title, rationale, category, impact, commercial_relevance, effort, urgency, confidence, priority_score, status, review_version, created_at)
      VALUES ('detail_rec', '${PROJECT}', 'detail_run', 'detail-rec', '${"a".repeat(64)}', 'Detail recommendation', 'Rationale', 'content', 5, 4, 2, 3, .8, 10, 'accepted', 1, '2026-05-01T00:00:00.000Z'),
      ('foreign_rec', '${FOREIGN}', 'foreign_run', 'foreign-rec', '${"b".repeat(64)}', 'Foreign recommendation', 'Rationale', 'content', 5, 4, 2, 3, .8, 10, 'accepted', 1, '2026-05-01T00:00:00.000Z');`,
      `INSERT INTO growth_actions (id, project_id, recommendation_id, creation_key, fact_hash, title, description, category, priority_score, status, state_version, due_at, approved_at, created_at, updated_at)
      VALUES ('${ACTION}', '${PROJECT}', 'detail_rec', 'detail-action', '${"c".repeat(64)}', 'Detail Action', 'Description', 'content', 10, 'ready', 1, '2026-06-30T00:00:00.000Z', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
      ('foreign_action', '${FOREIGN}', 'foreign_rec', 'foreign-action', '${"d".repeat(64)}', 'Foreign Action', 'Description', 'content', 10, 'approved', 0, '2026-06-30T00:00:00.000Z', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');`,
      `INSERT INTO growth_action_events (id, project_id, action_id, action_version, fact_hash, event_type, actor_type, actor_id, from_status, to_status, note, created_at) VALUES
      ('detail_event_0', '${PROJECT}', '${ACTION}', 0, '${"e".repeat(64)}', 'created', 'user', 'u', NULL, 'approved', NULL, '2026-06-01 11:59:00'),
      ('detail_event_1', '${PROJECT}', '${ACTION}', 1, '${"f".repeat(64)}', 'status_changed', 'user', 'u', 'approved', 'ready', 'before', '2026-06-01T12:00:00.000Z');`,
      `INSERT INTO growth_action_targets (project_id, action_id, target_type, target_value) VALUES ${Array.from({ length: 21 }, (_, i) => `('${PROJECT}', '${ACTION}', 'keyword', '${String.fromCharCode(65 + (i % 26))}${i}')`).join(",")};`,
      `INSERT INTO growth_recommendation_targets (project_id, run_id, recommendation_id, target_type, target_value) VALUES ('${PROJECT}', 'detail_run', 'detail_rec', 'keyword', 'A'), ('${PROJECT}', 'detail_run', 'detail_rec', 'keyword', 'a');`,
      `INSERT INTO growth_recommendation_steps (project_id, run_id, recommendation_id, position, content) VALUES ${Array.from({ length: 11 }, (_, i) => `('${PROJECT}', 'detail_run', 'detail_rec', ${i}, 'step ${i}')`).join(",")};`,
      `INSERT INTO growth_insights (id, project_id, run_id, creation_key, fact_hash, title, explanation, hypothesis, confidence, created_at) VALUES ${["A", "a", "b", "c", "d", "e"].map((id) => `('insight_${id}', '${PROJECT}', 'detail_run', 'insight-${id}', '${"1".repeat(64)}', 'I ${id}', 'Explanation', 'Hypothesis', .7, '2026-05-01T00:00:00.000Z')`).join(",")};`,
      `INSERT INTO growth_recommendation_insights (project_id, run_id, recommendation_id, insight_id) VALUES ${["A", "a", "b", "c", "d", "e"].map((id) => `('${PROJECT}', 'detail_run', 'detail_rec', 'insight_${id}')`).join(",")};`,
      `INSERT INTO growth_signals (id, project_id, run_id, signal_type, entity_type, entity_ref, metric, severity, confidence, period_start, period_end, baseline_value, current_value, delta_value, delta_percent, evidence_kind, evidence_ref, captured_at) VALUES ${Array.from({ length: 6 }, (_, i) => `('signal_${i}', '${PROJECT}', 'detail_run', 'signal', 'url', 'https://example.com/${i}', 'clicks', 'warning', .5, '2026-05-01', '2026-05-31', 1, 2, 1, 100, 'gsc_period', 'ref', '2026-06-01T00:00:00.000Z')`).join(",")};`,
      `INSERT INTO growth_insight_signals (project_id, run_id, insight_id, signal_id) VALUES ${Array.from({ length: 6 }, (_, i) => `('${PROJECT}', 'detail_run', 'insight_A', 'signal_${i}')`).join(",")}, ('${PROJECT}', 'detail_run', 'insight_e', 'signal_0');`,
      `INSERT INTO growth_change_events (id, project_id, creation_key, fact_hash, source, change_type, actor_type, actor_id, description, happened_at, created_at) VALUES ${Array.from({ length: 11 }, (_, i) => `('change_${i}', '${PROJECT}', 'change-${i}', '${"2".repeat(64)}', '${["manual", "sherpa", "cms_webhook", "deployment"][i % 4]}', 'content_updated', 'user', 'u', 'change ${i}', '${i === 10 ? "2026-06-01 11:10:00" : `2026-06-01T11:${String(i).padStart(2, "0")}:00.000Z`}', '${i === 0 ? "2026-06-01 11:00:00" : "2026-06-01T11:00:00.000Z"}')`).join(",")},
      ('change_future_happened', '${PROJECT}', 'future-happened', '${"3".repeat(64)}', 'manual', 'content_updated', 'user', 'u', 'future happened', '2026-06-01T13:00:00.000Z', '2026-06-01T11:00:00.000Z'),
      ('change_future_created', '${PROJECT}', 'future-created', '${"4".repeat(64)}', 'manual', 'content_updated', 'user', 'u', 'future created', '2026-06-01T11:59:00.000Z', '2026-06-01T13:00:00.000Z');`,
      `INSERT INTO growth_action_changes (project_id, action_id, change_event_id) VALUES ${Array.from({ length: 11 }, (_, i) => `('${PROJECT}', '${ACTION}', 'change_${i}')`).join(",")}, ('${PROJECT}', '${ACTION}', 'change_future_happened'), ('${PROJECT}', '${ACTION}', 'change_future_created');`,
      `INSERT INTO growth_change_event_urls (project_id, change_event_id, url) VALUES ${["change_10", "change_9"].flatMap((changeId) => Array.from({ length: 6 }, (_, i) => `('${PROJECT}', '${changeId}', 'https://example.com/${String.fromCharCode(65 + i)}')`)).join(",")};`,
    ].join("\n"),
  );
  ({ GrowthActionDetailRepository: repository } =
    await import("./GrowthActionDetailRepository"));
});

afterAll(() => client.close());

describe("GrowthActionDetailRepository SQLite", () => {
  it("is project-leading and treats missing and foreign Actions alike", async () => {
    await expect(
      repository.getDetail(FOREIGN, ACTION, AS_OF),
    ).resolves.toBeNull();
    await expect(
      repository.getDetail(PROJECT, "missing", AS_OF),
    ).resolves.toBeNull();
  });

  it("filters before limits, handles mixed SQLite timestamps, and bounds every emitted child graph", async () => {
    const detail = await repository.getDetail(PROJECT, ACTION, AS_OF);
    expect(detail?.root.action).not.toHaveProperty("ownerUserId");
    expect(detail?.root.action).not.toHaveProperty("factHash");
    expect(detail?.root.recommendation).not.toHaveProperty("model");
    expect(detail?.root.run).not.toHaveProperty("cadenceSlot");
    expect(detail?.history.map(({ actionVersion }) => actionVersion)).toEqual([
      1, 0,
    ]);
    expect(detail?.actionTargets).toHaveLength(21);
    expect(
      detail?.recommendationTargets.map(({ targetValue }) => targetValue),
    ).toEqual(["A", "a"]);
    expect(detail?.steps).toHaveLength(11);
    expect(detail?.insights.map(({ id }) => id)).toEqual([
      "insight_A",
      "insight_a",
      "insight_b",
      "insight_c",
      "insight_d",
      "insight_e",
    ]);
    expect(detail?.signals).toHaveLength(6);
    expect(
      detail?.signals.some(({ insightId }) => insightId === "insight_e"),
    ).toBe(false);
    expect(detail?.changes).toHaveLength(11);
    expect(detail?.changes[0]?.id).toBe("change_10");
    expect(
      detail?.changes.some(({ id }) => id.startsWith("change_future_")),
    ).toBe(false);
    expect(
      new Set(detail?.changes.slice(0, 10).map((change) => change.source)).size,
    ).toBe(4);
    expect(detail?.urls).toHaveLength(12);
    for (const changeId of ["change_10", "change_9"])
      expect(
        detail?.urls
          .filter(({ changeEventId }) => changeEventId === changeId)
          .map(({ url }) => url),
      ).toEqual([
        "https://example.com/A",
        "https://example.com/B",
        "https://example.com/C",
        "https://example.com/D",
        "https://example.com/E",
        "https://example.com/F",
      ]);
  });
});
