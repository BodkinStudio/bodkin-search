import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { withPgClient as withPgClientExport } from "@/db";
import type { GrowthRunsRepository as GrowthRunsRepositoryExport } from "./GrowthRunsRepository";

const testUrl = process.env.TEST_POSTGRES_DATABASE_URL;

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "postgres",
    HYPERDRIVE: { connectionString: testUrl },
  },
}));

type Repository = typeof GrowthRunsRepositoryExport;
type WithPgClient = typeof withPgClientExport;

let sql: ReturnType<typeof postgres>;
let GrowthRunsRepository: Repository;
let withPgClient: WithPgClient;

const describePostgres = testUrl ? describe : describe.skip;
const noop = () => {};

async function waitForBlockedGrowthRunLock(runId: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [result] = await sql<[{ blocked: boolean }]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_locks waiting
        JOIN pg_locks holding
          ON waiting.locktype = holding.locktype
          AND waiting.database IS NOT DISTINCT FROM holding.database
          AND waiting.relation IS NOT DISTINCT FROM holding.relation
          AND waiting.page IS NOT DISTINCT FROM holding.page
          AND waiting.tuple IS NOT DISTINCT FROM holding.tuple
          AND waiting.transactionid IS NOT DISTINCT FROM holding.transactionid
          AND waiting.classid IS NOT DISTINCT FROM holding.classid
          AND waiting.objid IS NOT DISTINCT FROM holding.objid
          AND waiting.objsubid IS NOT DISTINCT FROM holding.objsubid
          AND waiting.pid <> holding.pid
        WHERE NOT waiting.granted
          AND holding.granted
      ) AS blocked
    `;
    if (result?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Signal insert did not block on Growth run ${runId}`);
}

describePostgres("GrowthRunsRepository Postgres concurrency", () => {
  beforeAll(async () => {
    // TEST_POSTGRES_DATABASE_URL is the explicit opt-in for a disposable
    // OpenSEO container. This test does not create, drop, or migrate databases.
    sql = postgres(testUrl!, { max: 3 });
    ({ GrowthRunsRepository } = await import("./GrowthRunsRepository"));
    ({ withPgClient } = await import("@/db"));
  });

  afterAll(async () => {
    if (testUrl) await sql.end({ timeout: 5 });
  });

  it("uses migrated tables and makes terminal-first Signal insertion wait then no-op", async () => {
    const [tables] = await sql<
      [{ runs: string | null; signals: string | null }]
    >`
      SELECT to_regclass('public.growth_runs') AS runs,
             to_regclass('public.growth_signals') AS signals
    `;
    expect(tables).toEqual({ runs: "growth_runs", signals: "growth_signals" });

    const suffix = crypto.randomUUID();
    const organizationId = `growth_pg_org_${suffix}`;
    const projectId = `growth_pg_project_${suffix}`;
    const runId = `growth_pg_run_${suffix}`;
    const signalId = `growth_pg_signal_${suffix}`;
    await sql`
      INSERT INTO organization (id, name, slug, created_at)
      VALUES (${organizationId}, 'Growth test', ${`growth-test-${suffix}`}, now())
    `;
    await sql`
      INSERT INTO projects (id, organization_id, name)
      VALUES (${projectId}, ${organizationId}, 'Growth test')
    `;
    await sql`
      INSERT INTO growth_runs (
        id, project_id, run_type, trigger, status, cadence_slot, period_start,
        period_end, started_at, detector_version
      ) VALUES (
        ${runId}, ${projectId}, 'manual_analysis', 'manual', 'running',
        ${suffix}, '2026-08-01', '2026-08-29', '2026-08-29T10:00:00.000Z', 'v1'
      )
    `;

    let releaseTerminal = noop;
    try {
      const terminalReleased = new Promise<void>((resolve) => {
        releaseTerminal = resolve;
      });
      let terminalLocked!: () => void;
      const terminalHasLock = new Promise<void>((resolve) => {
        terminalLocked = resolve;
      });
      const terminal = sql.begin(async (tx) => {
        await tx`
          UPDATE growth_runs
          SET status = 'completed', completed_at = '2026-08-29T10:01:00.000Z'
          WHERE id = ${runId} AND project_id = ${projectId} AND status = 'running'
        `;
        terminalLocked();
        await terminalReleased;
      });
      await terminalHasLock;
      const signal = withPgClient(() =>
        GrowthRunsRepository.tryRecordSignalWhileRunIsRunning(
          {
            projectId,
            runId,
            signalType: "page_clicks_down",
            entityType: "page",
            entityRef: "https://example.test/pg",
            metric: "clicks",
            severity: "warning",
            confidence: 0.5,
            periodStart: "2026-08-01",
            periodEnd: "2026-08-29",
            baselineValue: 2,
            currentValue: 1,
            deltaValue: -1,
            deltaPercent: null,
            evidenceKind: "manual_observation",
            evidenceRef: "postgres:terminal-first",
            capturedAt: "2026-08-29T10:00:00.000Z",
          },
          signalId,
        ),
      );
      await waitForBlockedGrowthRunLock(runId);
      releaseTerminal();
      await terminal;
      await signal;

      const [run] = await sql<{ status: string }[]>`
        SELECT status FROM growth_runs WHERE id = ${runId}
      `;
      const [signals] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM growth_signals WHERE id = ${signalId}
      `;
      expect(run?.status).toBe("completed");
      expect(signals?.count).toBe("0");
    } finally {
      // Keep cleanup recoverable when a regression makes the lock probe fail:
      // otherwise the held terminal transaction would block these deletes.
      releaseTerminal();
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
      await sql`DELETE FROM organization WHERE id = ${organizationId}`;
    }
  });
});
