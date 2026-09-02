import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as RepositoryModule from "./GrowthOpportunityDecisionsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryModule.GrowthOpportunityDecisionsRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await client.executeMultiple(`
    CREATE TABLE growth_recommendation_signal_links (
      project_id text NOT NULL,
      signal_run_id text NOT NULL,
      signal_id text NOT NULL,
      dedupe_key text NOT NULL,
      recommendation_id text NOT NULL,
      relationship text NOT NULL,
      suppression_reason text,
      policy_version text NOT NULL,
      controller_released_at text,
      created_at text NOT NULL
    );
    INSERT INTO growth_recommendation_signal_links VALUES
      ('project_1','run_1','signal_controller','a','rec_controller','controller',NULL,'v1',NULL,'2026-09-01'),
      ('project_1','run_2','signal_released','b','rec_released','controller',NULL,'v1','2026-09-02','2026-09-01'),
      ('project_1','run_3','signal_suppressed','c','rec_suppressed','suppressed','existing_proposal','v1',NULL,'2026-09-01'),
      ('project_2','run_4','signal_foreign','d','rec_foreign','controller',NULL,'v1',NULL,'2026-09-01');
  `);
  ({ GrowthOpportunityDecisionsRepository: repository } =
    await import("./GrowthOpportunityDecisionsRepository"));
});

afterAll(() => client.close());

describe("GrowthOpportunityDecisionsRepository active controller sources", () => {
  it("returns only active controller sources from the authorized project and requested page", async () => {
    await expect(
      repository.listActiveControllerSources("project_1", [
        "rec_controller",
        "rec_released",
        "rec_suppressed",
        "rec_foreign",
      ]),
    ).resolves.toEqual([
      { recommendationId: "rec_controller", signalId: "signal_controller" },
    ]);
  });

  it("does not query when the emitted page is empty", async () => {
    await expect(
      repository.listActiveControllerSources("project_1", []),
    ).resolves.toEqual([]);
  });
});
