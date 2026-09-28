import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLinkedInClient,
  followerStatisticsSchema,
  pageStatisticsSchema,
  shareStatisticsSchema,
} from "./linkedinClient";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getAccessToken: mocks.token } }),
}));
const client = () =>
  createLinkedInClient({ userId: "user-1", linkedinAccountId: "member-1" });

describe("LinkedIn provider boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.token.mockResolvedValue({ accessToken: "test-token" });
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("accepts numeric organization IDs and documented extra response fields", async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        Response.json({
          paging: { start: 0, count: 100, links: [] },
          elements: [
            {
              organization: "urn:li:organization:123",
              role: "ADMINISTRATOR",
              state: "APPROVED",
              roleAssignee: "urn:li:person:abc",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 123,
          localizedName: "Bodkin Studio",
          vanityName: "bodkin-studio",
          versionTag: "42",
          $URN: "urn:li:organization:123",
        }),
      );
    await expect(client().listAdminPages()).resolves.toEqual([
      { pageId: "123", pageName: "Bodkin Studio" },
    ]);
    expect(mocks.fetch.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer test-token",
      "Linkedin-Version": "202608",
      "X-Restli-Protocol-Version": "2.0.0",
    });
  });

  it("keeps token failures distinguishable from transport failures", async () => {
    mocks.token.mockRejectedValue(new Error("private credential detail"));
    await expect(client().listAdminPages()).rejects.toMatchObject({
      failure: "unauthorized",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "forbidden"],
    [429, "rate_limited"],
  ] as const)("classifies HTTP %i", async (status, failure) => {
    mocks.fetch.mockResolvedValue(
      Response.json(
        {},
        { status, headers: status === 429 ? { "retry-after": "30" } : {} },
      ),
    );
    await expect(client().listAdminPages()).rejects.toMatchObject({
      failure,
      status,
      retryAfterSeconds: status === 429 ? 30 : null,
    });
  });

  it("rejects a pagination URL outside LinkedIn before sending another request", async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({
        elements: [],
        paging: {
          links: [
            {
              rel: "next",
              href: "https://attacker.example/rest/organizationAcls",
            },
          ],
        },
      }),
    );
    await expect(client().listAdminPages()).rejects.toMatchObject({
      failure: "malformed",
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("validates documented nested statistics while tolerating unused provider fields", () => {
    const envelope = { paging: { start: 0, count: 10, links: [] } };
    const identity = {
      organizationalEntity: "urn:li:organization:123",
      timeRange: { start: 1788220800000, end: 1788307200000 },
    };
    expect(
      followerStatisticsSchema.safeParse({
        ...envelope,
        elements: [
          {
            ...identity,
            followerGains: { organicFollowerGain: 3, paidFollowerGain: 2 },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      pageStatisticsSchema.safeParse({
        ...envelope,
        elements: [
          {
            ...identity,
            totalPageStatistics: {
              clicks: {},
              views: {
                allPageViews: { pageViews: 12 },
                allMobilePageViews: { pageViews: 4 },
              },
            },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      shareStatisticsSchema.safeParse({
        ...envelope,
        elements: [
          {
            ...identity,
            totalShareStatistics: {
              impressionCount: 100,
              uniqueImpressionsCount: 80,
              clickCount: 5,
              likeCount: -1,
              commentCount: 2,
              shareCount: 1,
              engagement: 0.07,
            },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects invalid statistics and excessive response rows", () => {
    expect(
      followerStatisticsSchema.safeParse({
        elements: [
          { followerGains: { organicFollowerGain: "3", paidFollowerGain: 2 } },
        ],
      }).success,
    ).toBe(false);
    expect(
      shareStatisticsSchema.safeParse({
        elements: [
          {
            totalShareStatistics: {
              impressionCount: Number.MAX_SAFE_INTEGER + 1,
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      pageStatisticsSchema.safeParse({
        elements: Array.from({ length: 367 }, () => ({
          totalPageStatistics: { views: { allPageViews: { pageViews: 1 } } },
        })),
      }).success,
    ).toBe(false);
  });
});
