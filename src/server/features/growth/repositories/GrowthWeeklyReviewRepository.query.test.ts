import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthWeeklyReviewRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryModule.GrowthWeeklyReviewRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await client.executeMultiple(`
    CREATE TABLE growth_measurement_results (
      id text PRIMARY KEY,
      project_id text NOT NULL,
      outcome text NOT NULL,
      evaluated_at text NOT NULL
    );
    CREATE TABLE growth_runs (
      id text PRIMARY KEY,
      project_id text NOT NULL,
      status text NOT NULL
    );
    CREATE TABLE growth_signals (
      id text PRIMARY KEY,
      project_id text NOT NULL,
      run_id text NOT NULL,
      signal_type text NOT NULL,
      metric text NOT NULL
    );
    CREATE TABLE growth_recommendation_signal_links (
      project_id text NOT NULL,
      signal_run_id text NOT NULL,
      signal_id text NOT NULL,
      relationship text NOT NULL,
      created_at text NOT NULL
    );
    CREATE TABLE growth_actions (
      id text PRIMARY KEY,
      project_id text NOT NULL,
      status text NOT NULL,
      due_at text NOT NULL
    );

    INSERT INTO growth_measurement_results VALUES
      ('gain', 'project_1', 'positive', '2026-09-01T12:00:00.000Z'),
      ('loss', 'project_1', 'strong_negative', '2026-09-06T23:59:59.999Z'),
      ('neutral', 'project_1', 'neutral', '2026-09-02T12:00:00.000Z'),
      ('before', 'project_1', 'positive', '2026-08-31T06:59:59.999Z'),
      ('at_end', 'project_1', 'negative', '2026-09-07T07:00:00.000Z'),
      ('other_gain', 'project_2', 'strong_positive', '2026-09-03T12:00:00.000Z');

    INSERT INTO growth_runs VALUES
      ('completed_run', 'project_1', 'completed'),
      ('running_run', 'project_1', 'running'),
      ('other_run', 'project_2', 'completed');
    INSERT INTO growth_signals VALUES
      ('controller_signal', 'project_1', 'completed_run', 'striking_distance_query', 'gsc_impressions'),
      ('suppressed_signal', 'project_1', 'completed_run', 'striking_distance_query', 'gsc_impressions'),
      ('running_signal', 'project_1', 'running_run', 'striking_distance_query', 'gsc_impressions'),
      ('wrong_type', 'project_1', 'completed_run', 'page_clicks_down', 'clicks'),
      ('other_signal', 'project_2', 'other_run', 'striking_distance_query', 'gsc_impressions');
    INSERT INTO growth_recommendation_signal_links VALUES
      ('project_1', 'completed_run', 'controller_signal', 'controller', '2026-09-02T12:00:00.000Z'),
      ('project_1', 'completed_run', 'suppressed_signal', 'suppressed', '2026-09-02T12:00:00.000Z'),
      ('project_1', 'running_run', 'running_signal', 'controller', '2026-09-02T12:00:00.000Z'),
      ('project_1', 'completed_run', 'wrong_type', 'controller', '2026-09-02T12:00:00.000Z'),
      ('project_2', 'other_run', 'other_signal', 'controller', '2026-09-02T12:00:00.000Z');

    INSERT INTO growth_actions VALUES
      ('overdue', 'project_1', 'approved', '2026-09-06T00:00:00.000Z'),
      ('newly_overdue', 'project_1', 'ready', '2026-09-08T00:00:00.000Z'),
      ('blocked', 'project_1', 'blocked', '2026-09-20T00:00:00.000Z'),
      ('future', 'project_1', 'ready', '2026-09-20T00:00:00.000Z'),
      ('done', 'project_1', 'implemented', '2026-09-01T00:00:00.000Z'),
      ('other_overdue', 'project_2', 'approved', '2026-09-01T00:00:00.000Z');
  `);
  ({ GrowthWeeklyReviewRepository: repository } =
    await import("./GrowthWeeklyReviewRepository"));
});

afterAll(() => client.close());

describe("GrowthWeeklyReviewRepository", () => {
  it("keeps period facts frozen while action risk uses the execution clock", async () => {
    await expect(
      repository.getCompactFacts({
        projectId: "project_1",
        startAt: "2026-08-31T07:00:00.000Z",
        endAt: "2026-09-07T07:00:00.000Z",
        asOf: "2026-09-07T07:00:00.000Z",
      }),
    ).resolves.toEqual({
      materialGains: 1,
      materialLosses: 1,
      newStrikingDistanceOpportunities: 1,
      actionsAtRisk: 2,
    });
    await expect(
      repository.getCompactFacts({
        projectId: "project_1",
        startAt: "2026-08-31T07:00:00.000Z",
        endAt: "2026-09-07T07:00:00.000Z",
        asOf: "2026-09-10T12:00:00.000Z",
      }),
    ).resolves.toEqual({
      materialGains: 1,
      materialLosses: 1,
      newStrikingDistanceOpportunities: 1,
      actionsAtRisk: 3,
    });
  });
});
