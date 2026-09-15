import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type * as RepositoryModule from "./GrowthAssessmentInvestigationsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryModule.GrowthAssessmentInvestigationsRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));
  vi.doMock("@/db/runBatch", () => ({
    runBatch: async (
      build: (tx: typeof testDb) => readonly Promise<unknown>[],
    ) => {
      for (const statement of build(testDb)) await statement;
    },
  }));
  await client.executeMultiple(
    [
      "PRAGMA foreign_keys = ON;",
      "CREATE TABLE projects (id text PRIMARY KEY, domain text, archived_at text);",
      readFileSync("drizzle/0064_massive_mongoose.sql", "utf8"),
      readFileSync("drizzle/0066_fine_firestar.sql", "utf8"),
      readFileSync("drizzle/0067_damp_gamora.sql", "utf8"),
      readFileSync("drizzle/0068_exotic_dakota_north.sql", "utf8"),
      readFileSync("drizzle/0069_calm_tarot.sql", "utf8"),
    ].join("\n"),
  );
  ({ GrowthAssessmentInvestigationsRepository: repository } =
    await import("./GrowthAssessmentInvestigationsRepository"));
});
afterAll(() => client.close());

async function seed(projectId: string, assessmentId: string) {
  await client.execute({
    sql: "INSERT INTO projects (id,domain) VALUES (?,?)",
    args: [projectId, "example.com"],
  });
  await client.execute({
    sql: "INSERT INTO growth_assessments (id,project_id,version,status,objective,market,audience,success_measure,objective_confirmed,comparison_rationale) VALUES (?,?,1,'ready','Objective','Market','Audience','Measure',1,'Rationale')",
    args: [assessmentId, projectId],
  });
}
function request(
  projectId: string,
  assessmentId: string,
  now = "2026-09-11T12:00:00.000Z",
) {
  return {
    projectId,
    assessmentId,
    assessmentVersion: 1,
    now,
    staleAfter: "2026-09-11T12:02:00.000Z",
    retryLimited: false,
  };
}
async function complete(
  run: Awaited<ReturnType<typeof repository.claim>>["run"],
  projectId: string,
  assessmentId: string,
) {
  const evidenceId = crypto.randomUUID();
  return repository.complete({
    id: run.id,
    projectId,
    assessmentId,
    attemptId: run.attemptId,
    now: "2026-09-11T12:01:00.000Z",
    pageStatus: "completed",
    analyticsStatus: "completed",
    findingsStatus: "completed",
    sourceUrl: "https://example.com/page",
    sourceTitle: "Page",
    sourceObservedAt: "2026-09-11T12:00:30.000Z",
    findings: [
      {
        title: "Observed",
        whyItMatters: "Matters",
        evidence: "Evidence",
        sourceUrl: "https://example.com/page",
        observedAt: "2026-09-11T12:00:30.000Z",
        recommendedNextStep: "Check",
        unverified: "Unknown",
      },
    ],
    evidence: [
      {
        id: evidenceId,
        source: "test",
        title: "Evidence",
        text: "Saved fact",
        url: null,
        observedAt: "2026-09-11T12:00:30.000Z",
        scope: "test",
      },
    ],
    decision: {
      verdict: "investigate",
      headline: "Check saved evidence",
      whyThisPage: "The accepted assessment selected this page.",
      rationale: "Evidence needs confirmation.",
      nextAction: "Review the saved report.",
      expectedOutcome: "A recorded decision.",
      measurement: "Record the verdict.",
      caveat: "This is test data.",
      evidenceIds: [evidenceId],
    },
  });
}

describe.sequential(
  "GrowthAssessmentInvestigationsRepository SQLite integration",
  () => {
    it("allows exactly one simultaneous claim", async () => {
      await seed("project_claim", "assessment_claim");
      const [first, second] = await Promise.all([
        repository.claim(request("project_claim", "assessment_claim")),
        repository.claim(request("project_claim", "assessment_claim")),
      ]);
      expect([first.claimed, second.claimed].filter(Boolean)).toHaveLength(1);
      expect(first.run.id).toBe(second.run.id);
    });

    it("replaces a saved draft that mixes metrics into prose while keeping valid completion idempotent", async () => {
      await seed("project_quality", "assessment_quality");
      const first = await repository.claim(
        request("project_quality", "assessment_quality"),
      );
      await complete(first.run, "project_quality", "assessment_quality");
      await client.execute({
        sql: "UPDATE growth_assessment_investigations SET decision_rationale = ? WHERE id = ?",
        args: ["The query has 17 impressions.", first.run.id],
      });
      const replacement = await repository.claim(
        request(
          "project_quality",
          "assessment_quality",
          "2026-09-11T12:03:00.000Z",
        ),
      );
      expect(replacement.claimed).toBe(true);
      expect(replacement.run.attemptId).not.toBe(first.run.attemptId);
      await complete(replacement.run, "project_quality", "assessment_quality");
      expect(
        (
          await repository.claim(
            request(
              "project_quality",
              "assessment_quality",
              "2026-09-11T12:04:00.000Z",
            ),
          )
        ).claimed,
      ).toBe(false);
    });

    it("renews only the current, unexpired owner lease", async () => {
      await seed("project_lease", "assessment_lease");
      const run = await repository.claim(
        request("project_lease", "assessment_lease"),
      );
      expect(
        await repository.renewActiveLease({
          projectId: "project_lease",
          id: run.run.id,
          attemptId: run.run.attemptId,
          now: "2026-09-11T12:00:30.000Z",
          staleAfter: "2026-09-11T12:08:30.000Z",
        }),
      ).toBe(true);
      expect(
        (
          await repository.claim(
            request(
              "project_lease",
              "assessment_lease",
              "2026-09-11T12:03:00.000Z",
            ),
          )
        ).claimed,
      ).toBe(false);
      expect(
        await repository.renewActiveLease({
          projectId: "project_lease",
          id: run.run.id,
          attemptId: run.run.attemptId,
          now: "2026-09-11T12:09:00.000Z",
          staleAfter: "2026-09-11T12:17:00.000Z",
        }),
      ).toBe(false);
    });

    it("retries a failed run with a new attempt and retains completed runs", async () => {
      await seed("project_retry", "assessment_retry");
      const first = await repository.claim(
        request("project_retry", "assessment_retry"),
      );
      await repository.fail(
        "project_retry",
        first.run.id,
        first.run.attemptId,
        "2026-09-11T12:01:00.000Z",
        "blocked",
      );
      const retry = await repository.claim(
        request(
          "project_retry",
          "assessment_retry",
          "2026-09-11T12:03:00.000Z",
        ),
      );
      expect(retry.claimed).toBe(true);
      expect(retry.run.attemptId).not.toBe(first.run.attemptId);
      await complete(retry.run, "project_retry", "assessment_retry");
      expect(
        (
          await repository.claim(
            request(
              "project_retry",
              "assessment_retry",
              "2026-09-11T12:04:00.000Z",
            ),
          )
        ).claimed,
      ).toBe(false);
    });

    it("retries a completed limited run only when explicitly requested", async () => {
      await seed("project_limited", "assessment_limited");
      const first = await repository.claim(
        request("project_limited", "assessment_limited"),
      );
      await repository.complete({
        id: first.run.id,
        projectId: "project_limited",
        assessmentId: "assessment_limited",
        attemptId: first.run.attemptId,
        now: "2026-09-11T12:01:00.000Z",
        pageStatus: "completed",
        analyticsStatus: "limited",
        findingsStatus: "completed",
        sourceUrl: "https://example.com/page",
        sourceTitle: "Page",
        sourceObservedAt: "2026-09-11T12:00:30.000Z",
        findings: [],
        evidence: [],
        decision: {
          verdict: "deprioritise",
          headline: "No decision evidence",
          whyThisPage: "Test page.",
          rationale: "Test only.",
          nextAction: "Do nothing.",
          expectedOutcome: "No change.",
          measurement: "No measurement.",
          caveat: "Test data.",
          evidenceIds: [],
        },
      });
      expect(
        (
          await repository.claim(
            request(
              "project_limited",
              "assessment_limited",
              "2026-09-11T12:03:00.000Z",
            ),
          )
        ).claimed,
      ).toBe(false);
      const retry = await repository.claim({
        ...request(
          "project_limited",
          "assessment_limited",
          "2026-09-11T12:04:00.000Z",
        ),
        retryLimited: true,
      });
      expect(retry).toMatchObject({ claimed: true });
      expect(retry.run.attemptId).not.toBe(first.run.attemptId);
    });

    it("fences stale attempt writes after a later retry", async () => {
      await seed("project_fence", "assessment_fence");
      const first = await repository.claim(
        request("project_fence", "assessment_fence"),
      );
      const retry = await repository.claim(
        request(
          "project_fence",
          "assessment_fence",
          "2026-09-11T12:03:00.000Z",
        ),
      );
      await repository.updateStage({
        id: first.run.id,
        projectId: "project_fence",
        attemptId: first.run.attemptId,
        now: "2026-09-11T12:03:01.000Z",
        pageStatus: "limited",
      });
      await repository.fail(
        "project_fence",
        first.run.id,
        first.run.attemptId,
        "2026-09-11T12:03:01.000Z",
        "old failure",
      );
      await complete(first.run, "project_fence", "assessment_fence");
      const current = await repository.get("project_fence", "assessment_fence");
      expect(current).toMatchObject({
        attemptId: retry.run.attemptId,
        status: "running",
        pageStatus: "pending",
      });
      expect(current?.findings).toEqual([]);
      expect(
        (
          await client.execute({
            sql: "SELECT id FROM growth_assessment_investigation_evidence WHERE project_id = ? AND attempt_id = ?",
            args: ["project_fence", first.run.attemptId],
          })
        ).rows,
      ).toEqual([]);
    });

    it("persists citations only for selected evidence", async () => {
      await seed("project_citations", "assessment_citations");
      const run = await repository.claim(
        request("project_citations", "assessment_citations"),
      );
      await complete(run.run, "project_citations", "assessment_citations");
      expect(
        (
          await client.execute({
            sql: "SELECT cited_by_decision FROM growth_assessment_investigation_evidence WHERE project_id = ? AND investigation_id = ?",
            args: ["project_citations", run.run.id],
          })
        ).rows,
      ).toEqual([{ cited_by_decision: 1 }]);
    });

    it("keeps projects isolated", async () => {
      await seed("project_one", "assessment_one");
      await seed("project_two", "assessment_two");
      await repository.claim(request("project_one", "assessment_one"));
      expect(await repository.get("project_two", "assessment_two")).toBeNull();
    });
  },
);
