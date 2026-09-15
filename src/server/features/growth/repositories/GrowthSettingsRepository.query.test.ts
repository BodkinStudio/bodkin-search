import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { GROWTH_SETTINGS_DEFAULTS } from "@/types/schemas/growth";
import type * as RepositoryModule from "./GrowthSettingsRepository";

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

let client: Client;
let GrowthSettingsRepository: typeof RepositoryModule.GrowthSettingsRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));

  // Exercise the checked-in D1 migration against the immediately preceding
  // project-memory schema, including the key-page table rebuild/backfill.
  await client.executeMultiple(
    [
      `CREATE TABLE projects (id text PRIMARY KEY, archived_at text);`,
      `INSERT INTO projects (id) VALUES ('proj_legacy');`,
      ...readFileSync("drizzle/0042_project_memory.sql", "utf8")
        .split("--> statement-breakpoint")
        .filter((statement) => !statement.includes("DROP TABLE")),
      `INSERT INTO project_key_pages (id, project_id, url, role, topic, notes, updated_at, updated_by) VALUES ('page_legacy', 'proj_legacy', 'https://acme.com/legacy', 'money', NULL, NULL, '2026-08-01T00:00:00.000Z', 'user');`,
      readFileSync("drizzle/0043_wild_proteus.sql", "utf8"),
      readFileSync("drizzle/0053_sweet_ben_grimm.sql", "utf8"),
      readFileSync("drizzle/0054_simple_sunspot.sql", "utf8"),
      readFileSync("drizzle/0055_lying_rick_jones.sql", "utf8"),
    ].join("\n"),
  );

  const legacyPage = await client.execute(
    "SELECT commercial_weight, protected, actively_optimized FROM project_key_pages WHERE id = 'page_legacy'",
  );
  expect(legacyPage.rows[0]).toMatchObject({
    commercial_weight: null,
    protected: 0,
    actively_optimized: 0,
  });

  ({ GrowthSettingsRepository } = await import("./GrowthSettingsRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  vi.useFakeTimers();
  await client.executeMultiple(`
    DELETE FROM growth_project_settings;
    INSERT OR IGNORE INTO projects (id) VALUES ('proj_1'), ('proj_2');
    UPDATE projects SET archived_at = NULL WHERE id IN ('proj_1', 'proj_2');
  `);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GrowthSettingsRepository", () => {
  it("returns null before a project has persisted settings", async () => {
    await expect(
      GrowthSettingsRepository.getByProjectId("proj_1"),
    ).resolves.toBeNull();
  });

  it("upserts one row per project and preserves its creation time", async () => {
    vi.setSystemTime("2026-08-29T10:00:00.000Z");
    await GrowthSettingsRepository.upsert("proj_1", GROWTH_SETTINGS_DEFAULTS);

    vi.setSystemTime("2026-08-30T10:00:00.000Z");
    await GrowthSettingsRepository.upsert("proj_1", {
      ...GROWTH_SETTINGS_DEFAULTS,
      growthEnabled: true,
      reportTimezone: "Europe/London",
    });

    await expect(
      GrowthSettingsRepository.getByProjectId("proj_1"),
    ).resolves.toEqual(
      expect.objectContaining({
        growthEnabled: true,
        reportTimezone: "Europe/London",
        createdAt: "2026-08-29T10:00:00.000Z",
        updatedAt: "2026-08-30T10:00:00.000Z",
        settingsRevision: 2,
      }),
    );
  });

  it("keeps settings isolated by project", async () => {
    await GrowthSettingsRepository.upsert("proj_1", GROWTH_SETTINGS_DEFAULTS);
    await GrowthSettingsRepository.upsert("proj_2", {
      ...GROWTH_SETTINGS_DEFAULTS,
      reportCadence: "weekly",
      reportDay: 5,
    });

    await expect(
      GrowthSettingsRepository.getByProjectId("proj_1"),
    ).resolves.toEqual(expect.objectContaining({ reportCadence: "monthly" }));
    await expect(
      GrowthSettingsRepository.getByProjectId("proj_2"),
    ).resolves.toEqual(expect.objectContaining({ reportCadence: "weekly" }));
  });

  it("cascades settings when the owning project is deleted", async () => {
    await GrowthSettingsRepository.upsert("proj_1", GROWTH_SETTINGS_DEFAULTS);
    await client.execute("DELETE FROM projects WHERE id = 'proj_1'");

    await expect(
      GrowthSettingsRepository.getByProjectId("proj_1"),
    ).resolves.toBeNull();
  });

  it("lists only active due monthly projects and claims with schedule/version CAS", async () => {
    await GrowthSettingsRepository.upsert(
      "proj_1",
      { ...GROWTH_SETTINGS_DEFAULTS, growthEnabled: true },
      "2026-09-01T00:00:00.000Z",
    );
    const row = await GrowthSettingsRepository.getByProjectId("proj_1");
    const due = await GrowthSettingsRepository.listDueMonthlyReviews(
      "2026-09-01T00:00:00.000Z",
      10,
    );
    expect(due).toEqual([
      expect.objectContaining({
        projectId: "proj_1",
        nextMonthlyReviewAt: "2026-09-01T00:00:00.000Z",
      }),
    ]);

    await expect(
      GrowthSettingsRepository.claimMonthlyReviewSchedule({
        projectId: "proj_1",
        settingsRevision: row!.settingsRevision,
        observedAt: "2026-09-01T00:00:00.000Z",
        nextAt: "2026-10-01T00:00:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      GrowthSettingsRepository.claimMonthlyReviewSchedule({
        projectId: "proj_1",
        settingsRevision: row!.settingsRevision,
        observedAt: "2026-09-01T00:00:00.000Z",
        nextAt: "2026-11-01T00:00:00.000Z",
      }),
    ).resolves.toBe(false);
    await expect(
      GrowthSettingsRepository.listDueMonthlyReviews(
        "2026-09-01T00:00:00.000Z",
        10,
      ),
    ).resolves.toEqual([]);
  });

  it("lists and claims only active due weekly projects", async () => {
    await GrowthSettingsRepository.upsert(
      "proj_1",
      {
        ...GROWTH_SETTINGS_DEFAULTS,
        growthEnabled: true,
        reportCadence: "weekly",
        reportDay: 1,
      },
      null,
      "2026-09-07T00:00:00.000Z",
    );
    const row = await GrowthSettingsRepository.getByProjectId("proj_1");
    await expect(
      GrowthSettingsRepository.listDueWeeklyReviews(
        "2026-09-07T00:00:00.000Z",
        10,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        projectId: "proj_1",
        nextWeeklyReviewAt: "2026-09-07T00:00:00.000Z",
      }),
    ]);
    await expect(
      GrowthSettingsRepository.claimWeeklyReviewSchedule({
        projectId: "proj_1",
        settingsRevision: row!.settingsRevision,
        observedAt: "2026-09-07T00:00:00.000Z",
        nextAt: "2026-09-14T00:00:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      GrowthSettingsRepository.listDueWeeklyReviews(
        "2026-09-07T00:00:00.000Z",
        10,
      ),
    ).resolves.toEqual([]);
  });

  it("rejects a weekly claim after a concurrent archive", async () => {
    await GrowthSettingsRepository.upsert(
      "proj_1",
      {
        ...GROWTH_SETTINGS_DEFAULTS,
        growthEnabled: true,
        reportCadence: "weekly",
        reportDay: 1,
      },
      null,
      "2026-09-07T00:00:00.000Z",
    );
    const row = await GrowthSettingsRepository.getByProjectId("proj_1");
    await client.execute(
      "UPDATE projects SET archived_at = '2026-09-07T00:00:01.000Z' WHERE id = 'proj_1'",
    );
    await expect(
      GrowthSettingsRepository.claimWeeklyReviewSchedule({
        projectId: "proj_1",
        settingsRevision: row!.settingsRevision,
        observedAt: "2026-09-07T00:00:00.000Z",
        nextAt: "2026-09-14T00:00:00.000Z",
      }),
    ).resolves.toBe(false);
  });

  it("increments a monotonic revision when settings writes share a timestamp", async () => {
    vi.setSystemTime("2026-09-01T00:00:00.000Z");
    await GrowthSettingsRepository.upsert("proj_1", GROWTH_SETTINGS_DEFAULTS);
    const first = await GrowthSettingsRepository.getByProjectId("proj_1");
    await GrowthSettingsRepository.upsert("proj_1", {
      ...GROWTH_SETTINGS_DEFAULTS,
      growthEnabled: true,
    });
    const second = await GrowthSettingsRepository.getByProjectId("proj_1");

    expect(second?.updatedAt).toBe(first?.updatedAt);
    expect(second?.settingsRevision).toBe((first?.settingsRevision ?? 0) + 1);
    await expect(
      GrowthSettingsRepository.claimMonthlyReviewSchedule({
        projectId: "proj_1",
        settingsRevision: first!.settingsRevision,
        observedAt: null,
        nextAt: "2026-10-01T00:00:00.000Z",
      }),
    ).resolves.toBe(false);
  });

  it("rejects a schedule claim when the project was archived after selection", async () => {
    await GrowthSettingsRepository.upsert(
      "proj_1",
      { ...GROWTH_SETTINGS_DEFAULTS, growthEnabled: true },
      "2026-09-01T00:00:00.000Z",
    );
    const row = await GrowthSettingsRepository.getByProjectId("proj_1");
    await client.execute(
      "UPDATE projects SET archived_at = '2026-09-01T00:00:01.000Z' WHERE id = 'proj_1'",
    );

    await expect(
      GrowthSettingsRepository.claimMonthlyReviewSchedule({
        projectId: "proj_1",
        settingsRevision: row!.settingsRevision,
        observedAt: "2026-09-01T00:00:00.000Z",
        nextAt: "2026-10-01T00:00:00.000Z",
      }),
    ).resolves.toBe(false);
  });
});
