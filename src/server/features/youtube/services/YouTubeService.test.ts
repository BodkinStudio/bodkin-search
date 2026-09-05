import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  YouTubeApiError,
  YouTubeMalformedResponseError,
  YouTubeTokenError,
} from "@/server/lib/youtubeErrors";
import { YouTubeService } from "./YouTubeService";

const mocks = vi.hoisted(() => ({
  grants: [] as Array<{ accountId: string }>,
  listChannels: vi.fn(),
  email: vi.fn(),
  upsert: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  exists: vi.fn(),
  deleteAccount: vi.fn(),
  selectWhere: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: mocks.selectWhere }) }),
    delete: () => ({ where: mocks.deleteAccount }),
  },
}));
vi.mock("@/db/schema", () => ({
  account: {
    userId: "userId",
    providerId: "providerId",
    accountId: "accountId",
  },
}));
vi.mock("@/server/lib/youtubeClient", () => ({
  createYouTubeClient: mocks.createClient,
}));
vi.mock("../repositories/YouTubeConnectionRepository", () => ({
  YouTubeConnectionRepository: {
    getByProjectId: mocks.get,
    upsert: mocks.upsert,
    deleteByProjectId: mocks.remove,
    existsForConnectorAccount: mocks.exists,
  },
}));
describe("YouTubeService", () => {
  beforeEach(() => {
    mocks.grants = [{ accountId: "a1" }, { accountId: "a2" }];
    mocks.listChannels
      .mockReset()
      .mockResolvedValue([{ channelId: "UC1", title: "One", customUrl: null }]);
    mocks.email.mockReset().mockResolvedValue("person@example.com");
    mocks.upsert.mockReset().mockResolvedValue({ id: "c1" });
    mocks.get.mockReset();
    mocks.remove.mockReset();
    mocks.exists.mockReset().mockResolvedValue(false);
    mocks.deleteAccount.mockReset();
    mocks.selectWhere.mockReset().mockImplementation(async () => mocks.grants);
    mocks.createClient.mockReset().mockReturnValue({
      listChannels: mocks.listChannels,
      getUserInfoEmail: mocks.email,
    });
  });
  it("lists only owned grants with per-account channels and nonfatal email", async () => {
    const result = await YouTubeService.listChannelsForUser("u1");
    expect(result.accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: "a1",
          email: "person@example.com",
          channels: [expect.objectContaining({ channelId: "UC1" })],
        }),
      ]),
    );
    expect(mocks.selectWhere).toHaveBeenCalledWith([
      ["userId", "u1"],
      ["providerId", "google-youtube"],
    ]);
    expect(mocks.createClient).toHaveBeenCalledWith({
      userId: "u1",
      youtubeAccountId: "a1",
    });
    expect(mocks.createClient).toHaveBeenCalledWith({
      userId: "u1",
      youtubeAccountId: "a2",
    });
  });

  it.each([
    [new YouTubeApiError(403, "forbidden"), "forbidden", false],
    [new YouTubeApiError(429, "quota"), "quota", false],
    [new YouTubeApiError(0, "transport"), "transport", false],
    [new YouTubeApiError(500, "upstream"), "upstream", false],
    [new YouTubeMalformedResponseError(), "malformed", false],
    [new YouTubeApiError(401, "unauthorized"), null, true],
    [new YouTubeTokenError(), null, true],
    [new Error("unexpected"), "upstream", false],
  ] as const)(
    "classifies provider failure %# without leaking it",
    async (error, unavailable, requiresReconnect) => {
      mocks.listChannels.mockRejectedValue(error);
      const result = await YouTubeService.listChannelsForUser("u1");
      expect(result.accounts[0]).toMatchObject({
        unavailable,
        requiresReconnect,
        channels: [],
      });
    },
  );

  it("treats account email lookup failure as nonfatal", async () => {
    mocks.email.mockResolvedValue(null);
    const result = await YouTubeService.listChannelsForUser("u1");
    expect(result.accounts[0]).toMatchObject({
      email: null,
      unavailable: null,
      channels: [expect.objectContaining({ channelId: "UC1" })],
    });
  });
  it("revalidates a selected channel and persists provider metadata", async () => {
    await YouTubeService.setChannel({
      projectId: "p1",
      organizationId: "o1",
      userId: "u1",
      accountId: "a1",
      channelId: "UC1",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        organizationId: "o1",
        channelTitle: "One",
        connectedAccountEmail: "person@example.com",
      }),
    );
    expect(mocks.createClient).toHaveBeenCalledWith({
      userId: "u1",
      youtubeAccountId: "a1",
    });
  });
  it("rejects an unknown account or channel", async () => {
    await expect(
      YouTubeService.setChannel({
        projectId: "p",
        organizationId: "o",
        userId: "u",
        accountId: "foreign",
        channelId: "UC1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      YouTubeService.setChannel({
        projectId: "p",
        organizationId: "o",
        userId: "u",
        accountId: "a1",
        channelId: "missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("only deletes an unused caller-owned grant", async () => {
    mocks.get.mockResolvedValue({
      connectedByUserId: "u1",
      youtubeAccountId: "a1",
    });
    await YouTubeService.disconnect({ projectId: "p", userId: "u1" });
    expect(mocks.remove).toHaveBeenCalledWith("p");
    expect(mocks.deleteAccount).toHaveBeenCalled();

    mocks.deleteAccount.mockClear();
    mocks.exists.mockResolvedValue(true);
    await YouTubeService.disconnect({ projectId: "p", userId: "u1" });
    expect(mocks.deleteAccount).not.toHaveBeenCalled();

    mocks.deleteAccount.mockClear();
    mocks.exists.mockResolvedValue(false);
    mocks.get.mockResolvedValue({
      connectedByUserId: "other",
      youtubeAccountId: "a1",
    });
    await YouTubeService.disconnect({ projectId: "p", userId: "u1" });
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });
});
