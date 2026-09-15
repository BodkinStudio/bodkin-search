import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthProjectSummaryRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let GrowthProjectSummaryRepository: typeof RepositoryModule.GrowthProjectSummaryRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  await client.executeMultiple(`
    CREATE TABLE growth_runs (id text PRIMARY KEY, project_id text NOT NULL, run_type text NOT NULL, trigger text NOT NULL, status text NOT NULL, cadence_slot text NOT NULL, period_start text NOT NULL, period_end text NOT NULL, started_at text NOT NULL, completed_at text, detector_version text NOT NULL);
    CREATE TABLE growth_signals (id text PRIMARY KEY, project_id text NOT NULL, run_id text NOT NULL, signal_type text NOT NULL, entity_type text NOT NULL, entity_ref text NOT NULL, metric text NOT NULL, severity text NOT NULL, confidence real NOT NULL, period_start text NOT NULL, period_end text NOT NULL, baseline_value real NOT NULL, current_value real NOT NULL, delta_value real NOT NULL, delta_percent real, evidence_kind text NOT NULL, evidence_ref text NOT NULL, captured_at text NOT NULL, created_at text NOT NULL);
    CREATE TABLE growth_recommendations (id text PRIMARY KEY, project_id text NOT NULL, run_id text NOT NULL, title text NOT NULL, rationale text NOT NULL, category text NOT NULL, impact integer NOT NULL, commercial_relevance integer NOT NULL, effort integer NOT NULL, urgency integer NOT NULL, confidence real NOT NULL, priority_score real NOT NULL, status text NOT NULL, snoozed_until text, created_at text NOT NULL);
    CREATE TABLE growth_actions (id text PRIMARY KEY, project_id text NOT NULL, recommendation_id text NOT NULL, title text NOT NULL, description text NOT NULL, category text NOT NULL, priority_score real NOT NULL, status text NOT NULL, state_version integer NOT NULL, due_at text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE growth_measurement_plans (id text PRIMARY KEY, project_id text NOT NULL, action_id text NOT NULL, status text NOT NULL, action_version integer NOT NULL, report_timezone text NOT NULL, measurement_end text NOT NULL, long_measurement_end text);

    INSERT INTO growth_runs VALUES
      ('run_completed','project_1','manual_analysis','manual','completed','slot','2026-01-01','2026-01-31','2026-02-01T00:00:00.000Z','2026-02-01T00:00:00.000Z','v1'),
      ('run_errors','project_1','manual_analysis','manual','completed_with_errors','slot2','2026-02-01','2026-02-28','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z','v1'),
      ('run_failed','project_1','manual_analysis','manual','failed','slot3','2026-03-01','2026-03-31','2026-04-01T00:00:00.000Z','2026-04-01T00:00:00.000Z','v1'),
      ('run_future','project_1','manual_analysis','manual','completed','slot4','2026-04-01','2026-04-30','2026-12-01T00:00:00.000Z','2026-12-01T00:00:00.000Z','v1'),
      ('run_late_complete','project_1','manual_analysis','manual','completed','slot5','2026-03-01','2026-03-31','2026-03-01T00:00:00.000Z','2026-12-01T00:00:00.000Z','v1'),
      ('run_foreign','project_2','manual_analysis','manual','completed','slot','2026-01-01','2026-01-31','2026-02-01T00:00:00.000Z','2026-02-01T00:00:00.000Z','v1');
    INSERT INTO growth_recommendations VALUES
      ('rec_a','project_1','run_completed','Accepted without action','Why','content',5,4,2,2,0.9,10,'accepted',NULL,'2026-03-01T00:00:00.000Z'),
      ('rec_top','project_1','run_completed','Top proposed','Why','content',5,4,2,2,0.9,20,'proposed',NULL,'2026-03-01T00:00:00.000Z'),
      ('rec_A','project_1','run_completed','Upper proposed','Why','content',5,4,2,2,0.9,10,'proposed',NULL,'2026-03-01T00:00:00.000Z'),
      ('rec_noaction','project_1','run_completed','Accepted without Action','Why','content',5,4,2,2,0.9,10,'accepted',NULL,'2026-03-01T00:00:00.000Z'),
      ('rec_p','project_1','run_completed','Proposed','Why','content',5,4,2,2,0.9,10,'proposed',NULL,'2026-03-01T00:00:00.000Z'),
      ('rec_z','project_1','run_completed','Snoozed','Why','content',5,4,2,2,0.9,10,'snoozed','2026-04-01','2026-03-01T00:00:00.000Z'),
      ('rec_mid','project_1','run_completed','Mid proposed','Why','content',5,4,2,2,0.9,9,'proposed',NULL,'2026-03-01T00:00:00.000Z'),
      ('rec_low','project_1','run_completed','Low proposed','Why','content',5,4,2,2,0.9,8,'proposed',NULL,'2026-03-01T00:00:00.000Z'),
      ('rec_last','project_1','run_completed','Last proposed','Why','content',5,4,2,2,0.9,7,'proposed',NULL,'2026-03-01T00:00:00.000Z'),
      ('rec_action','project_1','run_completed','Accepted with action','Why','content',5,4,2,2,0.9,99,'accepted',NULL,'2026-03-01T00:00:00.000Z'),
      ('rec_foreign','project_2','run_foreign','Foreign','Why','content',5,4,2,2,0.9,100,'proposed',NULL,'2026-03-01T00:00:00.000Z');
    INSERT INTO growth_actions VALUES
      ('action_link','project_1','rec_action','Linked','desc','content',1,'ready',1,'2026-03-30','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z'),
      ('action_A','project_1','rec_a','Current A','desc','content',10,'ready',1,'2026-03-20','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z'),
      ('action_a','project_1','rec_a','Current a','desc','content',10,'approved',0,'2026-03-20','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z'),
      ('action_z','project_1','rec_a','Current z','desc','content',10,'in_progress',2,'2026-03-20','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z'),
      ('action_mid','project_1','rec_a','Current mid','desc','content',5,'measuring',3,'2026-03-20','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z'),
      ('action_low','project_1','rec_a','Current low','desc','content',2,'blocked',2,'2026-03-20','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z'),
      ('action_last','project_1','rec_a','Current last','desc','content',1,'implemented',2,'2026-03-20','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z'),
      ('action_old','project_1','rec_a','Old','desc','content',100,'evaluated',3,'2026-01-01','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z'),
      ('action_foreign','project_2','rec_foreign','Foreign','desc','content',100,'ready',1,'2026-01-01','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z');
    INSERT INTO growth_measurement_plans VALUES
      ('plan_z','project_1','action_a','active',1,'UTC','2026-04-01',NULL),
      ('plan_a','project_1','missing_action','active',2,'UTC','2026-04-01',NULL),
      ('plan_done','project_1','action_a','completed',1,'UTC','2026-01-01',NULL),
      ('plan_foreign','project_2','action_foreign','active',1,'UTC','2026-01-01',NULL);
  `);

  const futureSignals = Array.from(
    { length: 7 },
    (_, index) =>
      `('future_${index}','project_1','run_completed','future','url','future','clicks','critical',1,'2026-01-01','2026-01-31',1,2,1,NULL,'gsc_period','ref','2026-12-01T00:00:00.000Z','2026-12-01T00:00:00.000Z')`,
  );
  await client.execute(
    `INSERT INTO growth_signals VALUES ${[
      ...futureSignals,
      "('signal_info','project_1','run_completed','info','url','info','clicks','info',1,'2026-01-01','2026-01-31',1,2,1,NULL,'gsc_period','ref','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z')",
      "('signal_warning','project_1','run_errors','warning','url','warning','clicks','warning',1,'2026-01-01','2026-01-31',1,2,1,NULL,'ga4_period','ref','2026-03-02T00:00:00.000Z','2026-03-02T00:00:00.000Z')",
      "('signal_critical_a','project_1','run_completed','critical','url','critical','clicks','critical',1,'2026-01-01','2026-01-31',1,2,1,NULL,'gsc_period','ref','2026-03-02T00:00:00.000Z','2026-03-02T00:00:00.000Z')",
      "('signal_critical_z','project_1','run_completed','critical','url','critical','clicks','critical',1,'2026-01-01','2026-01-31',1,2,1,NULL,'gsc_period','ref','2026-03-02T00:00:00.000Z','2026-03-02T00:00:00.000Z')",
      "('signal_critical_A','project_1','run_completed','critical','url','critical','clicks','critical',1,'2026-01-01','2026-01-31',1,2,1,NULL,'gsc_period','ref','2026-03-02T00:00:00.000Z','2026-03-02T00:00:00.000Z')",
      "('signal_critical_old','project_1','run_completed','critical','url','critical','clicks','critical',1,'2026-01-01','2026-01-31',1,2,1,NULL,'gsc_period','ref','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z')",
      "('signal_failed','project_1','run_failed','failed','url','failed','clicks','critical',1,'2026-01-01','2026-01-31',1,2,1,NULL,'audit_result','ref','2026-03-03T00:00:00.000Z','2026-03-03T00:00:00.000Z')",
      "('signal_late_complete','project_1','run_late_complete','late','url','late','clicks','critical',1,'2026-01-01','2026-01-31',1,2,1,NULL,'audit_result','ref','2026-03-03T00:00:00.000Z','2026-03-03T00:00:00.000Z')",
      "('signal_info_old','project_1','run_completed','info','url','info','clicks','info',1,'2026-01-01','2026-01-31',1,2,1,NULL,'gsc_period','ref','2026-02-01T00:00:00.000Z','2026-02-01T00:00:00.000Z')",
      "('signal_foreign','project_2','run_foreign','foreign','url','foreign','clicks','critical',1,'2026-01-01','2026-01-31',1,2,1,NULL,'gsc_period','ref','2026-03-03T00:00:00.000Z','2026-03-03T00:00:00.000Z')",
    ].join(",")}`,
  );
  ({ GrowthProjectSummaryRepository } =
    await import("./GrowthProjectSummaryRepository"));
});

afterAll(() => client.close());

describe("GrowthProjectSummaryRepository SQLite/D1", () => {
  const asOf = "2026-04-02T00:00:00.000Z";

  it("keeps unresolved Recommendations project-scoped and uses code-unit ties", async () => {
    const rows =
      await GrowthProjectSummaryRepository.listUnresolvedRecommendations(
        "project_1",
        6,
      );
    expect(rows.map(({ id }) => id)).toEqual([
      "rec_top",
      "rec_A",
      "rec_noaction",
      "rec_p",
      "rec_z",
      "rec_mid",
    ]);
    expect(rows).toHaveLength(6);
  });

  it("returns cap-plus-one current Actions in stable priority and due order", async () => {
    const rows = await GrowthProjectSummaryRepository.listCurrentActions(
      "project_1",
      6,
    );
    expect(rows.map(({ id }) => id)).toEqual([
      "action_A",
      "action_a",
      "action_z",
      "action_mid",
      "action_low",
      "action_last",
    ]);
    expect(rows).toHaveLength(6);
  });

  it("filters Signals by terminal Runs and asOf before limiting, with fixed severity order", async () => {
    const rows = await GrowthProjectSummaryRepository.listRecentSignals(
      "project_1",
      asOf,
      6,
    );
    expect(rows.map(({ id }) => id)).toEqual([
      "signal_critical_A",
      "signal_critical_a",
      "signal_critical_z",
      "signal_critical_old",
      "signal_warning",
      "signal_info",
    ]);
    expect(rows[0]).not.toHaveProperty("evidenceRef");
  });

  it("reports per-kind Signal freshness after the same asOf and terminal-run filtering", async () => {
    await expect(
      GrowthProjectSummaryRepository.listSignalFreshness("project_1", asOf),
    ).resolves.toEqual([
      { evidenceKind: "ga4_period", capturedAt: "2026-03-02T00:00:00.000Z" },
      { evidenceKind: "gsc_period", capturedAt: "2026-03-02T00:00:00.000Z" },
    ]);
  });

  it("selects the latest eligible Run and project-leading Plan/Action candidates", async () => {
    await expect(
      GrowthProjectSummaryRepository.getLatestRun("project_1", asOf),
    ).resolves.toMatchObject({ id: "run_failed" });
    const plans =
      await GrowthProjectSummaryRepository.listActiveMeasurementCandidates(
        "project_1",
        51,
      );
    expect(plans.map(({ id }) => id)).toEqual(["plan_a", "plan_z"]);
    expect(plans[0]).toMatchObject({
      actionId: "missing_action",
      actionStatus: null,
    });
  });
});
