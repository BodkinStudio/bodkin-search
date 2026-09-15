import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as BriefServiceModule from "./GrowthAiBriefProposalsService";
import type { GrowthAiBrief } from "@/types/schemas/growth-investigations";

const mocks = vi.hoisted(() => ({ getInvestigation: vi.fn() }));
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
vi.mock("./GrowthInvestigationsService", () => ({
  GrowthInvestigationsService: { getInvestigation: mocks.getInvestigation },
}));

let client: Client;
let briefs: typeof BriefServiceModule;
const generated: GrowthAiBrief = {
  kind: "growth_ai_brief",
  persistence: "ephemeral",
  generatedAt: "2026-09-06T12:00:00.000Z",
  affectedPageUrl: "https://example.com/pricing",
  currentBusinessContext: "available",
  currentPageRead: { status: "not_available" },
  businessRelevance: "Commercial page.",
  observations: [{ statement: "Clicks fell.", citationIds: ["saved"] }],
  hypotheses: [
    { statement: "Intent shifted.", confidence: "low", citationIds: ["saved"] },
  ],
  proposedSteps: ["Review intent."],
  measurementApproach: "Compare matching periods.",
  caveats: ["Hypothesis only."],
  citations: [
    {
      id: "saved",
      label: "Saved evidence",
      source: "historical_saved_evidence",
      snapshot: "Clicks fell.",
    },
  ],
};

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  type Statement = Parameters<typeof testDb.batch>[0][number];
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (
      build: (tx: typeof testDb) => readonly Promise<unknown>[],
    ) => {
      const statements = build(testDb);
      if (statements.length)
        await testDb.batch(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- nonempty D1-compatible query builders execute atomically in the SQLite fixture
          statements as unknown as [Statement, ...Statement[]],
        );
    },
  }));
  const file = (path: string) => readFileSync(path, "utf8");
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY, domain text, archived_at text);",
      "CREATE TABLE user (id text PRIMARY KEY);",
      "CREATE TABLE project_key_pages (id text PRIMARY KEY, project_id text NOT NULL, url text NOT NULL, role text NOT NULL, topic text, notes text, commercial_weight integer, protected integer NOT NULL DEFAULT 0, actively_optimized integer NOT NULL DEFAULT 0, updated_at text NOT NULL, updated_by text NOT NULL);",
      "INSERT INTO projects VALUES ('project_1','example.com',NULL); INSERT INTO user VALUES ('user_1');",
      file("drizzle/0044_glossy_komodo.sql"),
      file("drizzle/0045_mean_retro_girl.sql"),
      file("drizzle/0046_living_misty_knight.sql"),
      file("drizzle/0062_mixed_doctor_faustus.sql"),
      file("drizzle/0064_massive_mongoose.sql"),
      file("drizzle/0065_real_frog_thor.sql"),
      file("drizzle/0070_stormy_santa_claus.sql"),
      "INSERT INTO project_key_pages (id,project_id,url,role,updated_at,updated_by) VALUES ('key_1','project_1','https://example.com/pricing','money','2026-09-01T00:00:00.000Z','user');",
      "INSERT INTO growth_assessments (id,project_id,version,status,objective,market,audience,success_measure,objective_confirmed,comparison_rationale,selected_option_id,created_at) VALUES ('assessment_1','project_1',1,'ready','Increase qualified trials','UK','Operations leaders','Qualified trials',1,'This page has the clearest validation path','assessment_option_1','2026-09-01T00:00:00.000Z');",
      "INSERT INTO growth_assessment_options (id,project_id,assessment_id,ordinal,kind,title,business_relevance,evidence_source,evidence_date,evidence_scope,observation,uncertainty,next_validation,disposition,key_page_id) VALUES ('assessment_option_1','project_1','assessment_1',0,'page','Pricing page','Commercial journey','Saved report','2026-09-01','UK organic traffic','Clicks fell','Attribution is incomplete','Compare matching periods','selected','key_1');",
      `INSERT INTO growth_runs VALUES ('run_1','project_1','manual_analysis','manual','completed','priority-page-check:2026-09','2026-08-01','2026-08-28','2026-09-01T00:00:00.000Z','2026-09-01T01:00:00.000Z','priority-page-click-decline-v1','priority-page-investigation-v1',NULL,NULL,NULL,NULL,NULL);`,
      `INSERT INTO growth_signals VALUES ('signal_1','project_1','run_1','priority_page_click_decline','key_page','key_1','gsc_clicks','warning',0.8,'2026-08-01','2026-08-28',100,60,-40,-40,'gsc_period','saved','2026-09-01T01:00:00.000Z','2026-09-01T01:00:00.000Z');`,
      `INSERT INTO growth_recommendations VALUES ('recommendation_1','project_1','run_1','priority-page-investigation-v1:recommendation:signal_1','${"a".repeat(64)}','Original recommendation','Rationale','content',3,3,2,2,0.8,2.5,NULL,NULL,'proposed',0,NULL,NULL,NULL,NULL,'2026-09-01T01:00:00.000Z');`,
      `INSERT INTO growth_insights (id,project_id,run_id,creation_key,fact_hash,title,explanation,hypothesis,confidence) VALUES ('insight_1','project_1','run_1','priority-page-investigation-v1:insight:signal_1','${"a".repeat(64)}','Insight','Evidence','Unknown',0.5);`,
      `INSERT INTO growth_insight_signals VALUES ('project_1','run_1','insight_1','signal_1');`,
      `INSERT INTO growth_recommendation_insights VALUES ('project_1','run_1','recommendation_1','insight_1');`,
      `INSERT INTO growth_recommendation_targets VALUES ('project_1','run_1','recommendation_1','url','https://example.com/pricing');`,
    ].join("\n"),
  );
  mocks.getInvestigation.mockResolvedValue({
    relationship: "controller",
    recommendationId: "recommendation_1",
    templateVersion: "priority-page-investigation-v1",
    title: "Original recommendation",
    status: "proposed",
    reviewVersion: 0,
  });
  briefs = await import("./GrowthAiBriefProposalsService");
});
afterAll(() => client.close());

async function freshProposal(suffix: string) {
  for (const table of ["growth_signals", "growth_recommendations"] as const) {
    const result = await client.execute(`SELECT * FROM ${table} LIMIT 1`);
    const row = { ...result.rows[0] };
    row.id = `${table === "growth_signals" ? "signal" : "recommendation"}_${suffix}`;
    if (table === "growth_recommendations") {
      row.creation_key = `priority-page-investigation-v1:recommendation:signal_${suffix}`;
      row.status = "proposed";
      row.review_version = 0;
      row.reviewed_at = null;
    }
    await client.execute({
      sql: `INSERT INTO ${table} (${result.columns.join(",")}) VALUES (${result.columns.map(() => "?").join(",")})`,
      args: result.columns.map((column) => row[column]),
    });
  }
  await client.execute({
    sql: "INSERT INTO growth_recommendation_targets VALUES ('project_1','run_1',?,'url','https://example.com/pricing')",
    args: [`recommendation_${suffix}`],
  });
  mocks.getInvestigation.mockResolvedValue({
    relationship: "controller",
    recommendationId: `recommendation_${suffix}`,
    templateVersion: "priority-page-investigation-v1",
    title: "Source",
    status: "proposed",
    reviewVersion: 0,
  });
  return briefs.persistGeneratedGrowthAiBrief({
    projectId: "project_1",
    signalId: `signal_${suffix}`,
    generated,
    model: "fixture/model",
    promptVersion: "v2",
  });
}

describe.sequential(
  "Growth AI brief Action approval SQLite integration",
  () => {
    it("approves an edited brief with its independent version and replays exactly one Action/event", async () => {
      mocks.getInvestigation.mockResolvedValue({
        relationship: "controller",
        recommendationId: "recommendation_1",
        templateVersion: "priority-page-investigation-v1",
        title: "Original recommendation",
        status: "proposed",
        reviewVersion: 0,
      });
      const saved = await briefs.persistGeneratedGrowthAiBrief({
        projectId: "project_1",
        signalId: "signal_1",
        generated,
        model: "openrouter",
        promptVersion: "v1",
      });
      const edited = await briefs.saveGrowthAiBriefEdits({
        projectId: "project_1",
        briefId: saved.id,
        expectedVersion: 0,
        title: "Edited proposal",
        proposedSteps: ["Review intent.", "Talk to customers."],
        measurementApproach: "Measure after change.",
      });
      const request = {
        projectId: "project_1",
        briefId: edited.id,
        expectedVersion: 1,
        dueOn: "2026-09-30",
        actorId: "user_1",
      };
      const [first, replay] = await Promise.all([
        briefs.approveGrowthAiBrief(request),
        briefs.approveGrowthAiBrief(request),
      ]);
      expect(replay.brief.approval?.actionId).toBe(
        first.brief.approval?.actionId,
      );
      expect(
        (await client.execute("SELECT count(*) AS count FROM growth_actions"))
          .rows,
      ).toEqual([{ count: 1 }]);
      expect(
        (
          await client.execute(
            "SELECT count(*) AS count FROM growth_action_events",
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
      await expect(
        briefs.approveGrowthAiBrief({ ...request, dueOn: "2026-10-01" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        briefs.approveGrowthAiBrief({ ...request, actorId: "other" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
    it("keeps approved work qualified and retains its proposal after lifecycle transitions", async () => {
      const { GrowthActionsRepository: actions } =
        await import("../repositories/GrowthActionsRepository");
      const { GrowthActionsService: service } =
        await import("./GrowthActionsService");
      const saved = (await briefs.getGrowthAiBrief({
        projectId: "project_1",
        signalId: "signal_1",
      }))!;
      const work = await actions.listInvestigationWork("project_1", 50);
      expect(work).toHaveLength(1);
      expect(work[0]).toMatchObject({
        id: saved.approval!.actionId,
        aiBriefSignalId: "signal_1",
        title: "Edited proposal",
      });
      await service.transitionAction({
        projectId: "project_1",
        actionId: work[0].id,
        expectedVersion: 0,
        expectedStatus: "approved",
        status: "ready",
        actorType: "user",
        actorId: "user_1",
      });
      expect(
        (await actions.listInvestigationWork("project_1", 50))[0],
      ).toMatchObject({ status: "ready", aiBriefSignalId: "signal_1" });
      await expect(
        briefs.saveGrowthAiBriefEdits({
          projectId: "project_1",
          briefId: saved.id,
          expectedVersion: 1,
          title: "Overwrite",
          proposedSteps: ["Wrong"],
          measurementApproach: "Wrong",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
    it("rejects stale approval and rolls back an injected failure after Action creation", async () => {
      const saved = await freshProposal("rollback");
      const request = {
        projectId: "project_1",
        briefId: saved.id,
        expectedVersion: 0,
        dueOn: "2026-09-30",
        actorId: "user_1",
      };
      await expect(
        briefs.approveGrowthAiBrief({ ...request, expectedVersion: 3 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await client.execute(
        "CREATE TRIGGER fail_ai_approval BEFORE UPDATE OF approved_action_id ON growth_ai_briefs WHEN NEW.approved_action_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'injected link failure'); END;",
      );
      await expect(briefs.approveGrowthAiBrief(request)).rejects.toThrow();
      await client.execute("DROP TRIGGER fail_ai_approval");
      expect(
        (
          await client.execute(
            "SELECT status,review_version FROM growth_recommendations WHERE id='recommendation_rollback'",
          )
        ).rows,
      ).toEqual([{ status: "proposed", review_version: 0 }]);
      expect(
        (
          await client.execute(
            "SELECT count(*) AS count FROM growth_actions WHERE recommendation_id='recommendation_rollback'",
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await briefs.getGrowthAiBrief({
            projectId: "project_1",
            signalId: "signal_rollback",
          })
        )?.approval,
      ).toBeNull();
      const retry = await briefs.approveGrowthAiBrief(request);
      expect(retry.brief.approval).toMatchObject({
        version: 0,
        dueOn: "2026-09-30",
      });
    });
    it("does not duplicate a generic Action when the original approval won", async () => {
      const saved = await freshProposal("generic");
      const { GrowthActionsService: actions } =
        await import("./GrowthActionsService");
      await actions.approveProposedRecommendation(
        {
          projectId: "project_1",
          recommendationId: "recommendation_generic",
          creationKey: "priority-page-investigation-v1:action:signal_generic",
          title: "Original",
          description: "Original rationale",
          dueAt: "2026-09-30T00:00:00.000Z",
          targets: [{ type: "url", value: "https://example.com/pricing" }],
          actorType: "user",
          actorId: "user_1",
        },
        0,
      );
      await expect(
        briefs.approveGrowthAiBrief({
          projectId: "project_1",
          briefId: saved.id,
          expectedVersion: 0,
          dueOn: "2026-09-30",
          actorId: "user_1",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(
        (
          await client.execute(
            "SELECT count(*) AS count FROM growth_actions WHERE recommendation_id='recommendation_generic'",
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    });
  },
);
