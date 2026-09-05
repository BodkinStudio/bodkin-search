import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createYouTubeClient } from "./youtubeClient";
import {
  YouTubeMalformedResponseError,
  YouTubeTokenError,
} from "./youtubeErrors";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
}));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getAccessToken: mocks.getAccessToken } }),
}));
const client = () =>
  createYouTubeClient({ userId: "user-1", youtubeAccountId: "google-1" });
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers });

describe("YouTube client", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockResolvedValue({ accessToken: "secret-token" });
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("uses the dedicated grant and exact read-only channel endpoint", async () => {
    mocks.fetch.mockResolvedValue(
      response({
        items: [
          { id: "UC1", snippet: { title: "Channel", customUrl: "@channel" } },
        ],
      }),
    );
    await expect(client().listChannels()).resolves.toEqual([
      { channelId: "UC1", title: "Channel", customUrl: "@channel" },
    ]);
    expect(mocks.getAccessToken).toHaveBeenCalledWith({
      body: {
        providerId: "google-youtube",
        userId: "user-1",
        accountId: "google-1",
      },
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: "Bearer secret-token" } },
    );
  });
  it("accepts empty channels and optional custom URLs", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(
        response({ items: [{ id: "UC2", snippet: { title: "No URL" } }] }),
      );
    await expect(client().listChannels()).resolves.toEqual([]);
    await expect(client().listChannels()).resolves.toEqual([
      { channelId: "UC2", title: "No URL", customUrl: null },
    ]);
  });
  it.each([[{ items: [{ id: "UC", snippet: {} }] }], ["not-json"]])(
    "rejects malformed provider data",
    async (body) => {
      mocks.fetch.mockResolvedValue(response(body));
      await expect(client().listChannels()).rejects.toBeInstanceOf(
        YouTubeMalformedResponseError,
      );
    },
  );
  it("classifies missing and rejected tokens without exposing their cause", async () => {
    mocks.getAccessToken
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("raw token failure"));
    await expect(client().listChannels()).rejects.toBeInstanceOf(
      YouTubeTokenError,
    );
    await expect(client().listChannels()).rejects.toBeInstanceOf(
      YouTubeTokenError,
    );
  });
  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "quota"],
  ] as const)("classifies HTTP %i", async (status, failure) => {
    mocks.fetch.mockResolvedValue(
      response({}, status, status === 429 ? { "retry-after": "7" } : undefined),
    );
    await expect(client().listChannels()).rejects.toMatchObject({
      status,
      failure,
      retryAfterSeconds: status === 429 ? 7 : null,
    });
  });
  it("classifies transport failures and optional userinfo", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(response({ email: "person@example.com" }))
      .mockResolvedValueOnce(response({ email: "bad" }));
    await expect(client().listChannels()).rejects.toMatchObject({
      failure: "transport",
      status: 0,
    });
    await expect(client().getUserInfoEmail()).resolves.toBe(
      "person@example.com",
    );
    await expect(client().getUserInfoEmail()).resolves.toBeNull();
  });
  it("maps an aborted Analytics request to a safe transport failure", async () => {
    const aborted = new Error("request included private context");
    aborted.name = "AbortError";
    mocks.fetch.mockRejectedValue(aborted);
    await expect(
      client().queryAnalytics({
        channelId: "UC",
        startDate: "2026-01-01",
        endDate: "2026-01-01",
        metrics: ["views"],
      }),
    ).rejects.toMatchObject({ failure: "transport", status: 0 });
  });
  it("uses the selected channel and Analytics query parameters without another token", async () => {
    mocks.fetch.mockResolvedValue(
      response({
        columnHeaders: [
          { name: "views", columnType: "METRIC", dataType: "INTEGER" },
        ],
      }),
    );
    await client().queryAnalytics({
      channelId: "UC-selected",
      startDate: "2026-01-01",
      endDate: "2026-01-28",
      metrics: ["views"],
    });
    const [url, options] = mocks.fetch.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DUC-selected&startDate=2026-01-01&endDate=2026-01-28&metrics=views",
    );
    expect(options).toEqual({
      headers: { Authorization: "Bearer secret-token" },
    });
  });
  it("bounds retry information and only exposes normalized provider reasons", async () => {
    mocks.fetch.mockResolvedValue(
      response(
        {
          error: {
            status: "PERMISSION_DENIED",
            errors: [{ reason: "accessNotConfigured" }],
            message: "secret",
          },
        },
        403,
        { "retry-after": "999999" },
      ),
    );
    await expect(
      client().queryAnalytics({
        channelId: "UC",
        startDate: "2026-01-01",
        endDate: "2026-01-01",
        metrics: ["views"],
      }),
    ).rejects.toMatchObject({
      failure: "forbidden",
      retryAfterSeconds: 86_400,
      upstreamReason: "SERVICE_DISABLED",
    });
  });
  it("does not mistake a generic permission status for missing OAuth scope", async () => {
    mocks.fetch.mockResolvedValue(
      response({ error: { status: "PERMISSION_DENIED" } }, 403),
    );
    await expect(
      client().queryAnalytics({
        channelId: "UC",
        startDate: "2026-01-01",
        endDate: "2026-01-01",
        metrics: ["views"],
      }),
    ).rejects.toMatchObject({
      failure: "forbidden",
      upstreamReason: null,
    });
  });
});
