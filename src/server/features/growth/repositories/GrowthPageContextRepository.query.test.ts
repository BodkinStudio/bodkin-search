/* eslint-disable max-lines -- exhaustive cross-provider page/rank acceptance is clearest as one fixture */
import { createClient, type Client, type InValue } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthPageContextRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const PROJECT = "page_context_project";
const FOREIGN_PROJECT = "page_context_foreign";
const AS_OF = "2026-06-01T12:00:00.000Z";
const PAGE = "https://example.com/page";
const OTHER_PAGE = "https://example.com/other";

let client: Client;
let repository: typeof RepositoryModule.GrowthPageContextRepository;

async function insertRows(table: string, columns: string[], rows: InValue[][]) {
  if (rows.length === 0) return;
  const values = rows
    .map(() => `(${columns.map(() => "?").join(",")})`)
    .join(",");
  await client.execute({
    sql: `INSERT INTO ${table} (${columns.join(",")}) VALUES ${values}`,
    args: rows.flat(),
  });
}

async function createTables() {
  await client.executeMultiple(`
    CREATE TABLE project_key_pages (id text PRIMARY KEY, project_id text NOT NULL, url text NOT NULL, role text NOT NULL, commercial_weight integer, protected integer NOT NULL, actively_optimized integer NOT NULL, topic text, notes text, updated_at text NOT NULL, updated_by text NOT NULL);
    CREATE TABLE growth_recommendations (id text PRIMARY KEY, project_id text NOT NULL, run_id text NOT NULL, title text NOT NULL, priority_score real NOT NULL, status text NOT NULL, created_at text NOT NULL);
    CREATE TABLE growth_recommendation_targets (project_id text NOT NULL, run_id text NOT NULL, recommendation_id text NOT NULL, target_type text NOT NULL, target_value text NOT NULL);
    CREATE TABLE growth_actions (id text PRIMARY KEY, project_id text NOT NULL, recommendation_id text NOT NULL, title text NOT NULL, priority_score real NOT NULL, status text NOT NULL, state_version integer NOT NULL, due_at text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE growth_action_targets (project_id text NOT NULL, action_id text NOT NULL, target_type text NOT NULL, target_value text NOT NULL);
    CREATE TABLE growth_change_events (id text PRIMARY KEY, project_id text NOT NULL, source text NOT NULL, change_type text NOT NULL, description text NOT NULL, happened_at text NOT NULL, created_at text NOT NULL);
    CREATE TABLE growth_change_event_urls (project_id text NOT NULL, change_event_id text NOT NULL, url text NOT NULL);
    CREATE TABLE growth_measurement_plans (id text PRIMARY KEY, project_id text NOT NULL, action_id text NOT NULL, status text NOT NULL, action_version integer NOT NULL, report_timezone text NOT NULL, measurement_end text NOT NULL, long_measurement_end text, created_at text NOT NULL);
    CREATE TABLE rank_tracking_configs (id text PRIMARY KEY, project_id text NOT NULL, is_active integer NOT NULL);
    CREATE TABLE rank_tracking_keywords (id text PRIMARY KEY, config_id text NOT NULL, keyword text NOT NULL);
    CREATE TABLE rank_check_runs (id text PRIMARY KEY, config_id text NOT NULL, project_id text NOT NULL, status text NOT NULL, completed_at text);
    CREATE TABLE rank_snapshots (id integer PRIMARY KEY, run_id text NOT NULL, tracking_keyword_id text NOT NULL, keyword text NOT NULL, device text NOT NULL, position integer, url text, checked_at text NOT NULL);
  `);
}

async function seedKeyPages() {
  await insertRows(
    "project_key_pages",
    [
      "id",
      "project_id",
      "url",
      "role",
      "commercial_weight",
      "protected",
      "actively_optimized",
      "topic",
      "notes",
      "updated_at",
      "updated_by",
    ],
    [
      [
        "key_exact",
        PROJECT,
        `${PAGE}?variant=1`,
        "money",
        5,
        1,
        1,
        "Exact query",
        "Exact notes",
        "2026-05-10T00:00:00.000Z",
        "user",
      ],
      [
        "key_other_query",
        PROJECT,
        `${PAGE}?variant=2`,
        "spoke",
        1,
        0,
        0,
        "Other query",
        null,
        "2026-05-11T00:00:00.000Z",
        "user",
      ],
      [
        "key_foreign",
        FOREIGN_PROJECT,
        `${PAGE}?variant=1`,
        "hub",
        2,
        0,
        0,
        "Foreign",
        null,
        "2026-05-12T00:00:00.000Z",
        "user",
      ],
    ],
  );
}

async function seedRecommendations() {
  const recommendations: InValue[][] = [
    [
      "rec_top",
      PROJECT,
      "run",
      "Top",
      20,
      "proposed",
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "rec_future_action",
      PROJECT,
      "run",
      "Future Action",
      19,
      "accepted",
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "rec_foreign_action",
      PROJECT,
      "run",
      "Foreign Action",
      18,
      "accepted",
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "rec_A",
      PROJECT,
      "run",
      "Upper",
      10,
      "proposed",
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "rec_a",
      PROJECT,
      "run",
      "Lower",
      10,
      "proposed",
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "rec_snoozed",
      PROJECT,
      "run",
      "Snoozed",
      9,
      "snoozed",
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "rec_seventh",
      PROJECT,
      "run",
      "Seventh",
      8,
      "accepted",
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "rec_suppressed",
      PROJECT,
      "run",
      "Suppressed",
      99,
      "accepted",
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "rec_future",
      PROJECT,
      "run",
      "Future",
      100,
      "proposed",
      "2026-07-01T00:00:00.000Z",
    ],
    [
      "rec_wrong_url",
      PROJECT,
      "run",
      "Wrong URL",
      100,
      "proposed",
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "rec_dismissed",
      PROJECT,
      "run",
      "Dismissed",
      100,
      "dismissed",
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "rec_foreign",
      FOREIGN_PROJECT,
      "foreign_run",
      "Foreign",
      100,
      "proposed",
      "2026-05-01T00:00:00.000Z",
    ],
  ];
  await insertRows(
    "growth_recommendations",
    [
      "id",
      "project_id",
      "run_id",
      "title",
      "priority_score",
      "status",
      "created_at",
    ],
    recommendations,
  );
  await insertRows(
    "growth_recommendation_targets",
    [
      "project_id",
      "run_id",
      "recommendation_id",
      "target_type",
      "target_value",
    ],
    recommendations.map(([id, projectId, runId]) => [
      projectId,
      runId,
      id,
      "url",
      id === "rec_wrong_url" ? OTHER_PAGE : PAGE,
    ]),
  );
}

async function seedActions() {
  const actions: InValue[][] = [
    [
      "action_A",
      PROJECT,
      "rec_top",
      "Approved",
      10,
      "approved",
      0,
      "2026-06-10",
      "2026-05-01T00:00:00.000Z",
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "action_a",
      PROJECT,
      "rec_top",
      "Ready current update",
      10,
      "ready",
      1,
      "2026-06-10",
      "2026-05-01T00:00:00.000Z",
      "2026-07-01T00:00:00.000Z",
    ],
    [
      "action_b",
      PROJECT,
      "rec_top",
      "In progress",
      10,
      "in_progress",
      2,
      "2026-06-10",
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
    ],
    [
      "action_blocked",
      PROJECT,
      "rec_top",
      "Blocked",
      9,
      "blocked",
      2,
      "2026-06-11",
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
    ],
    [
      "action_implemented",
      PROJECT,
      "rec_top",
      "Implemented",
      8,
      "implemented",
      3,
      "2026-06-12",
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
    ],
    [
      "action_measuring",
      PROJECT,
      "rec_top",
      "Measuring",
      7,
      "measuring",
      4,
      "2026-06-13",
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
    ],
    [
      "action_seventh",
      PROJECT,
      "rec_top",
      "Seventh",
      6,
      "ready",
      1,
      "2026-06-14",
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
    ],
    [
      "action_plan_extra",
      PROJECT,
      "rec_top",
      "Plan extra",
      0,
      "ready",
      5,
      "2026-06-20",
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
    ],
    [
      "action_suppresses",
      PROJECT,
      "rec_suppressed",
      "Suppresses",
      0,
      "ready",
      1,
      "2026-06-20",
      "2026-05-15T00:00:00.000Z",
      "2026-05-15T00:00:00.000Z",
    ],
    [
      "action_after_cutoff",
      PROJECT,
      "rec_future_action",
      "Future",
      100,
      "ready",
      1,
      "2026-06-01",
      "2026-07-01T00:00:00.000Z",
      "2026-07-01T00:00:00.000Z",
    ],
    [
      "action_evaluated",
      PROJECT,
      "rec_top",
      "Evaluated",
      100,
      "evaluated",
      5,
      "2026-06-01",
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
    ],
    [
      "action_cancelled",
      PROJECT,
      "rec_top",
      "Cancelled",
      100,
      "cancelled",
      1,
      "2026-06-01",
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
    ],
    [
      "action_wrong_url",
      PROJECT,
      "rec_top",
      "Wrong URL",
      100,
      "ready",
      1,
      "2026-06-01",
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
    ],
    [
      "action_foreign",
      FOREIGN_PROJECT,
      "rec_foreign",
      "Foreign",
      100,
      "ready",
      1,
      "2026-06-01",
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
    ],
    [
      "action_foreign_collision",
      FOREIGN_PROJECT,
      "rec_foreign_action",
      "Foreign collision",
      0,
      "ready",
      1,
      "2026-06-01",
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
    ],
  ];
  await insertRows(
    "growth_actions",
    [
      "id",
      "project_id",
      "recommendation_id",
      "title",
      "priority_score",
      "status",
      "state_version",
      "due_at",
      "created_at",
      "updated_at",
    ],
    actions,
  );
  const targeted = actions.filter(
    ([id]) =>
      typeof id !== "string" ||
      !["action_suppresses", "action_foreign_collision"].includes(id),
  );
  await insertRows(
    "growth_action_targets",
    ["project_id", "action_id", "target_type", "target_value"],
    targeted.map(([id, projectId]) => [
      projectId,
      id,
      "url",
      id === "action_wrong_url" ? OTHER_PAGE : PAGE,
    ]),
  );
}

async function seedChanges() {
  const changes: InValue[][] = [
    [
      "change_A",
      PROJECT,
      "manual",
      "content_updated",
      "Upper",
      "2026-05-20T00:00:00.000Z",
      "2026-05-20T00:00:00.000Z",
    ],
    [
      "change_a",
      PROJECT,
      "deployment",
      "technical_fix",
      "Lower",
      "2026-05-20T00:00:00.000Z",
      "2026-05-20T00:00:00.000Z",
    ],
    [
      "change_3",
      PROJECT,
      "manual",
      "title_meta_updated",
      "Third",
      "2026-05-19T00:00:00.000Z",
      "2026-05-19T00:00:00.000Z",
    ],
    [
      "change_4",
      PROJECT,
      "manual",
      "internal_links_changed",
      "Fourth",
      "2026-05-18T00:00:00.000Z",
      "2026-05-18T00:00:00.000Z",
    ],
    [
      "change_5",
      PROJECT,
      "manual",
      "structured_data_changed",
      "Fifth",
      "2026-05-17T00:00:00.000Z",
      "2026-05-17T00:00:00.000Z",
    ],
    [
      "change_6",
      PROJECT,
      "manual",
      "design_restructure",
      "Sixth",
      "2026-05-16T00:00:00.000Z",
      "2026-05-16T00:00:00.000Z",
    ],
    [
      "change_7",
      PROJECT,
      "manual",
      "unknown",
      "Seventh",
      "2026-05-15T00:00:00.000Z",
      "2026-05-15T00:00:00.000Z",
    ],
    [
      "change_future_created",
      PROJECT,
      "manual",
      "content_updated",
      "Future created",
      "2026-05-30T00:00:00.000Z",
      "2026-07-01T00:00:00.000Z",
    ],
    [
      "change_future_happened",
      PROJECT,
      "manual",
      "content_updated",
      "Future happened",
      "2026-07-01T00:00:00.000Z",
      "2026-05-30T00:00:00.000Z",
    ],
    [
      "change_wrong_url",
      PROJECT,
      "manual",
      "content_updated",
      "Wrong URL",
      "2026-05-30T00:00:00.000Z",
      "2026-05-30T00:00:00.000Z",
    ],
    [
      "change_foreign",
      FOREIGN_PROJECT,
      "manual",
      "content_updated",
      "Foreign",
      "2026-05-30T00:00:00.000Z",
      "2026-05-30T00:00:00.000Z",
    ],
  ];
  await insertRows(
    "growth_change_events",
    [
      "id",
      "project_id",
      "source",
      "change_type",
      "description",
      "happened_at",
      "created_at",
    ],
    changes,
  );
  await insertRows(
    "growth_change_event_urls",
    ["project_id", "change_event_id", "url"],
    changes.map(([id, projectId]) => [
      projectId,
      id,
      id === "change_wrong_url" ? OTHER_PAGE : PAGE,
    ]),
  );
}

async function seedMeasurements() {
  const plans: InValue[][] = [
    [
      "plan_A",
      PROJECT,
      "action_a",
      "active",
      2,
      "UTC",
      "2026-06-10",
      null,
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "plan_a",
      PROJECT,
      "action_b",
      "active",
      2,
      "UTC",
      "2026-06-10",
      null,
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "plan_3",
      PROJECT,
      "action_blocked",
      "active",
      2,
      "UTC",
      "2026-06-11",
      null,
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "plan_4",
      PROJECT,
      "action_implemented",
      "active",
      3,
      "UTC",
      "2026-06-12",
      null,
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "plan_5",
      PROJECT,
      "action_measuring",
      "active",
      3,
      "UTC",
      "2026-06-12",
      "2026-06-13",
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "plan_6",
      PROJECT,
      "action_seventh",
      "active",
      1,
      "UTC",
      "2026-06-14",
      null,
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "plan_7",
      PROJECT,
      "action_plan_extra",
      "active",
      5,
      "UTC",
      "2026-06-15",
      null,
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "plan_completed",
      PROJECT,
      "action_evaluated",
      "completed",
      5,
      "UTC",
      "2026-05-20",
      null,
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "plan_future",
      PROJECT,
      "action_suppresses",
      "active",
      1,
      "UTC",
      "2026-06-01",
      null,
      "2026-07-01T00:00:00.000Z",
    ],
    [
      "plan_future_action",
      PROJECT,
      "action_after_cutoff",
      "active",
      1,
      "UTC",
      "2026-06-01",
      null,
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "plan_wrong_url",
      PROJECT,
      "action_wrong_url",
      "active",
      1,
      "UTC",
      "2026-06-01",
      null,
      "2026-05-01T00:00:00.000Z",
    ],
    [
      "plan_foreign",
      FOREIGN_PROJECT,
      "action_foreign",
      "active",
      1,
      "UTC",
      "2026-06-01",
      null,
      "2026-05-01T00:00:00.000Z",
    ],
  ];
  await insertRows(
    "growth_measurement_plans",
    [
      "id",
      "project_id",
      "action_id",
      "status",
      "action_version",
      "report_timezone",
      "measurement_end",
      "long_measurement_end",
      "created_at",
    ],
    plans,
  );
}

function pageVariants(path: string) {
  return [
    `http://example.com${path}`,
    `http://example.com${path}/`,
    `http://www.example.com${path}`,
    `http://www.example.com${path}/`,
    `https://example.com${path}`,
    `https://example.com${path}/`,
    `https://www.example.com${path}`,
    `https://www.example.com${path}/`,
  ];
}

// oxlint-disable-next-line eslint(max-lines-per-function) -- rank winner and exclusion evidence stays in one auditable seed.
async function seedRanks() {
  await insertRows(
    "rank_tracking_configs",
    ["id", "project_id", "is_active"],
    [
      ["config_active", PROJECT, 1],
      ["config_inactive", PROJECT, 0],
      ["config_foreign", FOREIGN_PROJECT, 1],
    ],
  );

  const orderedKeywords = [
    ["ordered_01", "position 01", "desktop", 1],
    ["ordered_02", "position 02", "desktop", 2],
    ["ordered_03", "position 03", "desktop", 3],
    ["ordered_04", "position 04", "desktop", 4],
    ["ordered_05", "position 05", "desktop", 5],
    ["ordered_06", "position 06", "desktop", 6],
    ["ordered_A", "Alpha", "desktop", 20],
    ["ordered_a", "alpha", "desktop", 20],
    ["ordered_same", "same keyword", "desktop", 21],
    ["ordered_same", "same keyword", "mobile", 21],
    ["ordered_null_A", "Null A", "desktop", null],
    ["ordered_null_a", "Null a", "desktop", null],
  ] as const;
  const specialKeywords = [
    "moved",
    "checked_tie",
    "id_tie",
    "future_run",
    "future_snapshot",
    "space_future_snapshot",
    "iso_same_day_eligible",
    "mixed_format_order",
    "failed",
    "null_completed",
    "wrong_url",
  ];
  await insertRows(
    "rank_tracking_keywords",
    ["id", "config_id", "keyword"],
    [
      ...[
        ...new Map(
          orderedKeywords.map(([id, keyword]) => [id, keyword]),
        ).entries(),
      ].map(([id, keyword]) => [id, "config_active", keyword]),
      ...specialKeywords.map((id) => [id, "config_active", id]),
      ["inactive_keyword", "config_inactive", "inactive"],
      ["foreign_keyword", "config_foreign", "foreign"],
    ],
  );

  await insertRows(
    "rank_check_runs",
    ["id", "config_id", "project_id", "status", "completed_at"],
    [
      [
        "run_ordered",
        "config_active",
        PROJECT,
        "completed",
        "2026-05-01T00:00:00.000Z",
      ],
      [
        "run_old",
        "config_active",
        PROJECT,
        "completed",
        "2026-04-01T00:00:00.000Z",
      ],
      [
        "run_new",
        "config_active",
        PROJECT,
        "completed",
        "2026-05-01T00:00:00.000Z",
      ],
      [
        "run_same_1",
        "config_active",
        PROJECT,
        "completed",
        "2026-05-15T00:00:00.000Z",
      ],
      [
        "run_same_2",
        "config_active",
        PROJECT,
        "completed",
        "2026-05-15T00:00:00.000Z",
      ],
      [
        "run_future",
        "config_active",
        PROJECT,
        "completed",
        "2026-07-01T00:00:00.000Z",
      ],
      [
        "run_failed",
        "config_active",
        PROJECT,
        "failed",
        "2026-05-20T00:00:00.000Z",
      ],
      ["run_null", "config_active", PROJECT, "completed", null],
      [
        "run_inactive",
        "config_inactive",
        PROJECT,
        "completed",
        "2026-05-20T00:00:00.000Z",
      ],
      [
        "run_foreign",
        "config_foreign",
        FOREIGN_PROJECT,
        "completed",
        "2026-05-20T00:00:00.000Z",
      ],
    ],
  );

  const variants = pageVariants("/page");
  const orderedSnapshots: InValue[][] = orderedKeywords.map(
    ([id, keyword, device, position], index) => [
      100 + index,
      "run_ordered",
      id,
      keyword,
      device,
      position,
      variants[index % variants.length],
      "2026-05-01T00:00:00.000Z",
    ],
  );
  await insertRows(
    "rank_snapshots",
    [
      "id",
      "run_id",
      "tracking_keyword_id",
      "keyword",
      "device",
      "position",
      "url",
      "checked_at",
    ],
    [
      ...orderedSnapshots,
      [
        200,
        "run_old",
        "moved",
        "moved",
        "desktop",
        1,
        "https://example.com/winner",
        "2026-04-01T00:00:00.000Z",
      ],
      [
        201,
        "run_new",
        "moved",
        "moved",
        "desktop",
        1,
        OTHER_PAGE,
        "2026-05-01T00:00:00.000Z",
      ],
      [
        202,
        "run_same_1",
        "checked_tie",
        "checked tie",
        "desktop",
        2,
        "https://example.com/winner",
        "2026-05-01T00:00:00.000Z",
      ],
      [
        203,
        "run_same_2",
        "checked_tie",
        "checked tie",
        "desktop",
        2,
        OTHER_PAGE,
        "2026-05-02T00:00:00.000Z",
      ],
      [
        204,
        "run_same_1",
        "id_tie",
        "id tie",
        "desktop",
        3,
        "https://example.com/winner",
        "2026-05-03T00:00:00.000Z",
      ],
      [
        205,
        "run_same_2",
        "id_tie",
        "id tie",
        "desktop",
        3,
        OTHER_PAGE,
        "2026-05-03T00:00:00.000Z",
      ],
      [
        206,
        "run_old",
        "future_run",
        "future run",
        "desktop",
        4,
        "http://www.example.com/winner/",
        "2026-04-01T00:00:00.000Z",
      ],
      [
        207,
        "run_future",
        "future_run",
        "future run",
        "desktop",
        4,
        OTHER_PAGE,
        "2026-05-30T00:00:00.000Z",
      ],
      [
        208,
        "run_old",
        "future_snapshot",
        "future snapshot",
        "desktop",
        5,
        "https://www.example.com/winner",
        "2026-04-01T00:00:00.000Z",
      ],
      [
        209,
        "run_new",
        "future_snapshot",
        "future snapshot",
        "desktop",
        5,
        OTHER_PAGE,
        "2026-07-01T00:00:00.000Z",
      ],
      [
        216,
        "run_old",
        "space_future_snapshot",
        "space future snapshot",
        "desktop",
        6,
        "https://example.com/winner",
        "2026-04-01T00:00:00.000Z",
      ],
      [
        217,
        "run_new",
        "space_future_snapshot",
        "space future snapshot",
        "desktop",
        6,
        OTHER_PAGE,
        "2026-06-01 23:00:00",
      ],
      [
        218,
        "run_new",
        "iso_same_day_eligible",
        "ISO same day eligible",
        "desktop",
        7,
        "https://example.com/winner",
        "2026-06-01T11:00:00.000Z",
      ],
      [
        219,
        "run_same_1",
        "mixed_format_order",
        "mixed format order",
        "desktop",
        8,
        "https://example.com/winner",
        "2026-06-01 10:00:00",
      ],
      [
        220,
        "run_same_2",
        "mixed_format_order",
        "mixed format order",
        "desktop",
        8,
        OTHER_PAGE,
        "2026-06-01T11:00:00.000Z",
      ],
      [
        210,
        "run_failed",
        "failed",
        "failed",
        "desktop",
        1,
        "https://example.com/winner",
        "2026-05-20T00:00:00.000Z",
      ],
      [
        211,
        "run_null",
        "null_completed",
        "null completed",
        "desktop",
        1,
        "https://example.com/winner",
        "2026-05-20T00:00:00.000Z",
      ],
      [
        212,
        "run_new",
        "removed_keyword",
        "removed",
        "desktop",
        1,
        "https://example.com/winner",
        "2026-05-20T00:00:00.000Z",
      ],
      [
        213,
        "run_inactive",
        "inactive_keyword",
        "inactive",
        "desktop",
        1,
        "https://example.com/winner",
        "2026-05-20T00:00:00.000Z",
      ],
      [
        214,
        "run_foreign",
        "foreign_keyword",
        "foreign",
        "desktop",
        1,
        "https://example.com/winner",
        "2026-05-20T00:00:00.000Z",
      ],
      [
        215,
        "run_new",
        "wrong_url",
        "wrong url",
        "desktop",
        1,
        `${PAGE}?query=1`,
        "2026-05-20T00:00:00.000Z",
      ],
    ],
  );
}

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await createTables();
  await seedKeyPages();
  await seedRecommendations();
  await seedActions();
  await seedChanges();
  await seedMeasurements();
  await seedRanks();
  ({ GrowthPageContextRepository: repository } =
    await import("./GrowthPageContextRepository"));
});

afterAll(() => client.close());

describe("GrowthPageContextRepository SQLite/D1", () => {
  it("uses exact project-scoped key-page identity", async () => {
    await expect(
      repository.keyPage(PROJECT, `${PAGE}?variant=1`),
    ).resolves.toMatchObject({
      role: "money",
      topic: "Exact query",
      protected: true,
    });
    await expect(repository.keyPage(PROJECT, PAGE)).resolves.toBeNull();
    await expect(
      repository.keyPage(PROJECT, `${PAGE}?variant=2`),
    ).resolves.toMatchObject({ topic: "Other query" });
  });

  it("filters unresolved page Recommendations before a stable cap-plus-one", async () => {
    const rows = await repository.recommendations(PROJECT, PAGE, AS_OF, 6);
    expect(rows.map(({ id }) => id)).toEqual([
      "rec_top",
      "rec_future_action",
      "rec_foreign_action",
      "rec_A",
      "rec_a",
      "rec_snoozed",
    ]);
    expect(rows).toHaveLength(6);
  });

  it("returns all six operational Action states and retains current post-cutoff updates", async () => {
    const rows = await repository.actions(PROJECT, PAGE, AS_OF, 6);
    expect(rows.map(({ id }) => id)).toEqual([
      "action_A",
      "action_a",
      "action_b",
      "action_blocked",
      "action_implemented",
      "action_measuring",
    ]);
    expect(rows.map(({ status }) => status)).toEqual([
      "approved",
      "ready",
      "in_progress",
      "blocked",
      "implemented",
      "measuring",
    ]);
    expect(rows[1]?.updatedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("applies both Change cutoffs before recency and BINARY ties", async () => {
    const rows = await repository.changes(PROJECT, PAGE, AS_OF, 6);
    expect(rows.map(({ id }) => id)).toEqual([
      "change_A",
      "change_a",
      "change_3",
      "change_4",
      "change_5",
      "change_6",
    ]);
    expect(rows).toHaveLength(6);
  });

  it("returns active page Measurements with current Action integrity inputs", async () => {
    const rows = await repository.measurements(PROJECT, PAGE, AS_OF, 6);
    expect(rows.map(({ id }) => id)).toEqual([
      "plan_A",
      "plan_a",
      "plan_3",
      "plan_4",
      "plan_5",
      "plan_6",
    ]);
    expect(rows[0]).toMatchObject({
      actionId: "action_a",
      actionVersion: 2,
      actionStatus: "ready",
      actionStateVersion: 1,
    });
    expect(rows).toHaveLength(6);
  });

  it("selects rank winners before URL filtering and excludes ineligible history", async () => {
    const rows = await repository.ranks(
      PROJECT,
      AS_OF,
      pageVariants("/winner"),
      11,
    );
    expect(rows.map(({ trackingKeywordId }) => trackingKeywordId)).toEqual([
      "future_run",
      "future_snapshot",
      "space_future_snapshot",
      "iso_same_day_eligible",
    ]);
    expect(rows.map(({ snapshotId }) => snapshotId)).toEqual([
      206, 208, 216, 218,
    ]);
  });

  it("accepts common URL variants and orders eleven rows with null positions last", async () => {
    const rows = await repository.ranks(
      PROJECT,
      AS_OF,
      pageVariants("/page"),
      11,
    );
    expect(rows.map(({ trackingKeywordId }) => trackingKeywordId)).toEqual([
      "ordered_01",
      "ordered_02",
      "ordered_03",
      "ordered_04",
      "ordered_05",
      "ordered_06",
      "ordered_A",
      "ordered_a",
      "ordered_same",
      "ordered_same",
      "ordered_null_A",
    ]);
    expect(rows.at(-1)?.position).toBeNull();
    expect(rows).toHaveLength(11);
  });
});
