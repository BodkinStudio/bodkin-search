import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as RepositoryModule from "./YouTubeConnectionRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

let client: Client;
let repository: typeof RepositoryModule.YouTubeConnectionRepository;

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  const testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));

  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE organization (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
    );
    INSERT INTO organization (id) VALUES ('organization-1');
    INSERT INTO projects (id, organization_id)
      VALUES ('project-1', 'organization-1');
  `);
  await client.executeMultiple(
    readFileSync("drizzle/0058_windy_shen.sql", "utf8").replaceAll(
      "--> statement-breakpoint",
      "",
    ),
  );

  ({ YouTubeConnectionRepository: repository } =
    await import("./YouTubeConnectionRepository"));
});

afterAll(() => client.close());

beforeEach(async () => {
  await client.execute("DELETE FROM youtube_connections");
});

describe("YouTubeConnectionRepository", () => {
  it("reads, changes, and removes one project connection", async () => {
    await expect(repository.getByProjectId("project-1")).resolves.toBeNull();

    await repository.upsert({
      projectId: "project-1",
      organizationId: "organization-1",
      channelId: "channel-1",
      channelTitle: "Original channel",
      channelCustomUrl: "@original",
      connectedByUserId: "user-1",
      youtubeAccountId: "account-1",
      connectedAccountEmail: "owner@example.com",
    });

    await expect(repository.getByProjectId("project-1")).resolves.toEqual(
      expect.objectContaining({
        projectId: "project-1",
        channelId: "channel-1",
        channelTitle: "Original channel",
        connectedAccountEmail: "owner@example.com",
      }),
    );
    await expect(
      repository.existsForConnectorAccount("user-1", "account-1"),
    ).resolves.toBe(true);
    await expect(
      repository.existsForConnectorAccount("user-1", "account-other"),
    ).resolves.toBe(false);

    await repository.upsert({
      projectId: "project-1",
      organizationId: "organization-1",
      channelId: "channel-2",
      channelTitle: "Changed channel",
      channelCustomUrl: null,
      connectedByUserId: "user-1",
      youtubeAccountId: "account-1",
      connectedAccountEmail: null,
    });

    await expect(repository.getByProjectId("project-1")).resolves.toEqual(
      expect.objectContaining({
        channelId: "channel-2",
        channelTitle: "Changed channel",
        channelCustomUrl: null,
        connectedAccountEmail: "owner@example.com",
      }),
    );

    await repository.deleteByProjectId("project-1");
    await expect(repository.getByProjectId("project-1")).resolves.toBeNull();
  });

  it("does not retain another connector's email when the account changes", async () => {
    await repository.upsert({
      projectId: "project-1",
      organizationId: "organization-1",
      channelId: "channel-1",
      channelTitle: "Original channel",
      channelCustomUrl: null,
      connectedByUserId: "user-1",
      youtubeAccountId: "account-1",
      connectedAccountEmail: "old@example.com",
    });

    await repository.upsert({
      projectId: "project-1",
      organizationId: "organization-1",
      channelId: "channel-2",
      channelTitle: "New channel",
      channelCustomUrl: null,
      connectedByUserId: "user-2",
      youtubeAccountId: "account-2",
      connectedAccountEmail: null,
    });

    await expect(repository.getByProjectId("project-1")).resolves.toEqual(
      expect.objectContaining({
        connectedByUserId: "user-2",
        youtubeAccountId: "account-2",
        connectedAccountEmail: null,
      }),
    );
  });
});
