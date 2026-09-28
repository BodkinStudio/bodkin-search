import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { growthRecentChangesRequestSchema } from "@/types/schemas/growth-recent-changes";
import type * as RepositoryModule from "./GrowthChangeEventsRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryModule.GrowthChangeEventsRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await client.executeMultiple(`
    CREATE TABLE growth_change_events (id text PRIMARY KEY, project_id text NOT NULL, creation_key text NOT NULL, fact_hash text NOT NULL, source text NOT NULL, change_type text NOT NULL, actor_type text NOT NULL, actor_id text NOT NULL, description text NOT NULL, happened_at text NOT NULL, external_ref text, created_at text NOT NULL);
    CREATE TABLE growth_change_event_urls (project_id text NOT NULL, change_event_id text NOT NULL, url text NOT NULL);
    INSERT INTO growth_change_events VALUES
      ('event_z','project_1','z','${"a".repeat(64)}','manual','content_updated','user','user','Z','2026-08-20T09:00:00.000Z',NULL,'2026-08-20 09:01:00'),
      ('event_a','project_1','a','${"b".repeat(64)}','manual','content_updated','user','user','A','2026-08-20T09:00:00.000Z',NULL,'2026-08-20 09:02:00'),
      ('event_old','project_1','old','${"c".repeat(64)}','manual','technical_fix','user','user','Old','2026-08-19T09:00:00.000Z',NULL,'2026-08-19 09:01:00'),
      ('event_sherpa','project_1','sherpa','${"d".repeat(64)}','sherpa','content_updated','system','system','Sherpa','2026-08-21T09:00:00.000Z',NULL,'2026-08-21 09:01:00'),
      ('event_foreign','project_2','foreign','${"e".repeat(64)}','manual','content_updated','user','user','Foreign','2026-08-22T09:00:00.000Z',NULL,'2026-08-22 09:01:00');
    INSERT INTO growth_change_event_urls VALUES
      ('project_1','event_z','https://example.com/z'),
      ('project_1','event_z','https://example.com/A'),
      ('project_1','event_z','https://example.com/a'),
      ('project_2','event_z','https://example.com/foreign'),
      ('project_2','event_foreign','https://example.com/foreign-event');
  `);
  ({ GrowthChangeEventsRepository: repository } =
    await import("./GrowthChangeEventsRepository"));
});

afterAll(() => client.close());

describe("GrowthChangeEventsRepository recent manual changes on SQLite/D1", () => {
  it("uses manual-only canonical keyset paging with binary ID ties", async () => {
    const first = await repository.listRecentManualChangeEventsPage({
      projectId: "project_1",
      limit: 1,
    });
    expect(first.map((value) => value.id)).toEqual(["event_z", "event_a"]);

    const second = await repository.listRecentManualChangeEventsPage(
      growthRecentChangesRequestSchema.parse({
        projectId: "project_1",
        limit: 50,
        cursor: { happenedAt: "2026-08-20T10:00:00+01:00", id: "event_z" },
      }),
    );
    expect(second.map((value) => value.id)).toEqual(["event_a", "event_old"]);
  });

  it("uses one project-leading, binary-ordered URL bulk read with the 101-row sentinel", async () => {
    await client.executeMultiple(`
      INSERT INTO growth_change_event_urls VALUES ${Array.from(
        { length: 102 },
        (_, index) =>
          `('project_1','event_a','https://example.com/${String(index).padStart(3, "0")}')`,
      ).join(",")};
    `);
    const urls = await repository.listUrlsForRecentChangeEvents("project_1", [
      "event_z",
      "event_a",
      "event_foreign",
    ]);
    expect(
      urls.filter((value) => value.changeEventId === "event_a"),
    ).toHaveLength(101);
    expect(
      urls
        .filter((value) => value.changeEventId === "event_z")
        .map((value) => value.url),
    ).toEqual([
      "https://example.com/A",
      "https://example.com/a",
      "https://example.com/z",
    ]);
    expect(urls.some((value) => value.changeEventId === "event_foreign")).toBe(
      false,
    );
  });
});
