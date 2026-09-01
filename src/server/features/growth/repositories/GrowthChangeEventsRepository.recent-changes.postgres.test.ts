import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthChangeEventsRepository as RepositoryExport } from "./GrowthChangeEventsRepository";

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

describePostgres(
  "GrowthChangeEventsRepository recent manual changes on Postgres",
  () => {
    beforeAll(async () => {
      sql = postgres(testUrl!, { max: 3 });
      ({ GrowthChangeEventsRepository: repository } =
        await import("./GrowthChangeEventsRepository"));
      ({ withPgClient } = await import("@/db"));
    });
    afterAll(async () => {
      if (testUrl) await sql.end({ timeout: 5 });
    });

    it("keeps manual keyset and bounded project-leading URL reads provider-equivalent", async () => {
      const suffix = crypto.randomUUID();
      const org = `recent_change_org_${suffix}`;
      const project = `recent_change_project_${suffix}`;
      const foreignOrg = `recent_change_foreign_org_${suffix}`;
      const foreignProject = `recent_change_foreign_project_${suffix}`;
      const ids = {
        z: `recent_change_z_${suffix}`,
        a: `recent_change_a_${suffix}`,
        old: `recent_change_old_${suffix}`,
        sherpa: `recent_change_sherpa_${suffix}`,
        foreign: `recent_change_foreign_${suffix}`,
      };
      try {
        await sql`INSERT INTO organization (id,name,slug,created_at) VALUES (${org},'Recent change',${`recent-change-${suffix}`},now()),(${foreignOrg},'Foreign recent change',${`recent-change-foreign-${suffix}`},now())`;
        await sql`INSERT INTO projects (id,organization_id,name,domain) VALUES (${project},${org},'Recent change','example.com'),(${foreignProject},${foreignOrg},'Foreign recent change','other.example')`;
        await sql`
        INSERT INTO growth_change_events (id,project_id,creation_key,fact_hash,source,change_type,actor_type,actor_id,description,happened_at,external_ref,created_at) VALUES
        (${ids.z},${project},'z',${"a".repeat(64)},'manual','content_updated','user','user','Z','2026-08-20T09:00:00.000Z',NULL,'2026-08-20T09:01:00.000Z'),
        (${ids.a},${project},'a',${"b".repeat(64)},'manual','content_updated','user','user','A','2026-08-20T09:00:00.000Z',NULL,'2026-08-20T09:02:00.000Z'),
        (${ids.old},${project},'old',${"c".repeat(64)},'manual','technical_fix','user','user','Old','2026-08-19T09:00:00.000Z',NULL,'2026-08-19T09:01:00.000Z'),
        (${ids.sherpa},${project},'sherpa',${"d".repeat(64)},'sherpa','content_updated','system','system','Sherpa','2026-08-21T09:00:00.000Z',NULL,'2026-08-21T09:01:00.000Z'),
        (${ids.foreign},${foreignProject},'foreign',${"e".repeat(64)},'manual','content_updated','user','user','Foreign','2026-08-22T09:00:00.000Z',NULL,'2026-08-22T09:01:00.000Z')
      `;
        await sql`INSERT INTO growth_change_event_urls (project_id,change_event_id,url) VALUES (${project},${ids.z},'https://example.com/z'),(${project},${ids.z},'https://example.com/A'),(${project},${ids.z},'https://example.com/a'),(${foreignProject},${ids.foreign},'https://example.com/foreign')`;
        await sql`
          INSERT INTO growth_change_event_urls (project_id,change_event_id,url)
          SELECT ${project}, ${ids.a}, 'https://example.com/' || lpad(value::text, 3, '0')
          FROM generate_series(0, 101) AS series(value)
        `;

        const first = await withPgClient(() =>
          repository.listRecentManualChangeEventsPage({
            projectId: project,
            limit: 1,
          }),
        );
        expect(first.map((value) => value.id)).toEqual([ids.z, ids.a]);
        const second = await withPgClient(() =>
          repository.listRecentManualChangeEventsPage({
            projectId: project,
            limit: 50,
            cursor: { happenedAt: "2026-08-20T09:00:00.000Z", id: ids.z },
          }),
        );
        expect(second.map((value) => value.id)).toEqual([ids.a, ids.old]);
        const urls = await withPgClient(() =>
          repository.listUrlsForRecentChangeEvents(project, [
            ids.z,
            ids.a,
            ids.foreign,
          ]),
        );
        expect(
          urls
            .filter((value) => value.changeEventId === ids.a)
            .map((value) => value.url),
        ).toHaveLength(101);
        expect(
          urls
            .filter((value) => value.changeEventId === ids.z)
            .map((value) => value.url),
        ).toEqual([
          "https://example.com/A",
          "https://example.com/a",
          "https://example.com/z",
        ]);
        expect(urls.some((value) => value.changeEventId === ids.foreign)).toBe(
          false,
        );
      } finally {
        await sql`DELETE FROM projects WHERE id IN (${project},${foreignProject})`;
        await sql`DELETE FROM organization WHERE id IN (${org},${foreignOrg})`;
      }
    }, 15_000);
  },
);
