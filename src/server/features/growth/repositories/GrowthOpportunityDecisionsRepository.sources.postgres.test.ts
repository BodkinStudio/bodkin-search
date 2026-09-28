import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthOpportunityDecisionsRepository as RepositoryExport } from "./GrowthOpportunityDecisionsRepository";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;
vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

const describePostgres = testUrl ? describe : describe.skip;
let sql: ReturnType<typeof postgres>;
let repository: typeof RepositoryExport;
let withPgClient: typeof withPgClientExport;

function sourceSignalId(recommendationId: string) {
  return `signal_${recommendationId}`;
}

function sourceRunId(recommendationId: string) {
  return `run_${recommendationId}`;
}

describePostgres(
  "Growth Opportunity active controller sources on Postgres",
  () => {
    beforeAll(async () => {
      sql = postgres(testUrl!, { max: 3 });
      ({ GrowthOpportunityDecisionsRepository: repository } =
        await import("./GrowthOpportunityDecisionsRepository"));
      ({ withPgClient } = await import("@/db"));
    });
    afterAll(async () => {
      if (testUrl) await sql.end({ timeout: 5 });
    });

    it("returns only requested active controllers from the authorized project", async () => {
      const suffix = crypto.randomUUID();
      const project = `opportunity_source_project_${suffix}`;
      const foreignProject = `opportunity_source_foreign_project_${suffix}`;
      const org = `opportunity_source_org_${suffix}`;
      const foreignOrg = `opportunity_source_foreign_org_${suffix}`;
      const ids = {
        active: `opportunity_source_active_${suffix}`,
        released: `opportunity_source_released_${suffix}`,
        suppressed: `opportunity_source_suppressed_${suffix}`,
        unrequested: `opportunity_source_unrequested_${suffix}`,
        foreign: `opportunity_source_foreign_${suffix}`,
      };
      try {
        await sql`INSERT INTO organization (id,name,slug,created_at) VALUES
        (${org},'Opportunity source',${`opportunity-source-${suffix}`},now()),
        (${foreignOrg},'Opportunity source foreign',${`opportunity-source-foreign-${suffix}`},now())`;
        await sql`INSERT INTO projects (id,organization_id,name,domain) VALUES
        (${project},${org},'Opportunity source','example.com'),
        (${foreignProject},${foreignOrg},'Opportunity source foreign','foreign.example')`;
        for (const [index, recommendationId] of Object.values(ids).entries()) {
          const isForeign = recommendationId === ids.foreign;
          const currentProject = isForeign ? foreignProject : project;
          const runId = sourceRunId(recommendationId);
          const signalId = sourceSignalId(recommendationId);
          await sql`INSERT INTO growth_runs (id,project_id,run_type,trigger,status,cadence_slot,period_start,period_end,started_at,completed_at,detector_version)
          VALUES (${runId},${currentProject},'manual_analysis','manual','completed',${`${suffix}-${index}`},'2026-08-01','2026-08-29','2026-08-30T00:00:00.000Z','2026-08-30T00:01:00.000Z','v1')`;
          await sql`INSERT INTO growth_signals (id,project_id,run_id,signal_type,entity_type,entity_ref,metric,severity,confidence,period_start,period_end,baseline_value,current_value,delta_value,evidence_kind,evidence_ref,captured_at)
          VALUES (${signalId},${currentProject},${runId},'page_clicks_down','page','page','clicks','warning',0.5,'2026-08-01','2026-08-29',2,1,-1,'manual_observation',${`source-${index}`},'2026-08-30T00:00:00.000Z')`;
          await sql`INSERT INTO growth_recommendations (id,project_id,run_id,creation_key,fact_hash,title,rationale,category,impact,commercial_relevance,effort,urgency,confidence,priority_score)
          VALUES (${recommendationId},${currentProject},${runId},${`key-${index}`},${"a".repeat(64)},'Title','Rationale','content',1,1,1,1,0.5,1)`;
          await sql`INSERT INTO growth_recommendation_signal_links (project_id,signal_run_id,signal_id,dedupe_key,recommendation_id,relationship,suppression_reason,policy_version,controller_released_at)
          VALUES (${currentProject},${runId},${signalId},${String(index).padStart(64, "0")},${recommendationId},
          ${recommendationId === ids.suppressed ? "suppressed" : "controller"},
          ${recommendationId === ids.suppressed ? "existing_proposal" : null},
          'v1',${recommendationId === ids.released ? "2026-09-01T00:00:00.000Z" : null})`;
        }
        await expect(
          withPgClient(() =>
            repository.listActiveControllerSources(project, [
              ids.active,
              ids.released,
              ids.suppressed,
              ids.foreign,
            ]),
          ),
        ).resolves.toEqual([
          {
            recommendationId: ids.active,
            signalId: sourceSignalId(ids.active),
          },
        ]);
      } finally {
        await sql`DELETE FROM projects WHERE id IN (${project}, ${foreignProject})`;
        await sql`DELETE FROM organization WHERE id IN (${org}, ${foreignOrg})`;
      }
    }, 15_000);
  },
);
