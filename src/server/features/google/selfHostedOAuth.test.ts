import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createSelfHostedGoogleAuthorizationUrl,
  GA4_INTEGRATION,
  YOUTUBE_INTEGRATION,
  GSC_INTEGRATION,
  handleSelfHostedGoogleOAuthCallback,
  type SelfHostedGoogleOAuthIntegration,
} from "./selfHostedOAuth";

const mocks = vi.hoisted(() => ({
  getGoogleOAuthClientConfig: vi.fn(),
  hasSelfHostedGoogleOAuthConfig: vi.fn(),
  fetch: vi.fn(),
  selectLimit: vi.fn(),
  insertValues: vi.fn<(value: unknown) => unknown>(),
  updateSet: vi.fn(),
  getAuth: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
}));
vi.mock("@/db/schema", () => ({
  account: {
    id: "id",
    userId: "userId",
    providerId: "providerId",
    accountId: "accountId",
  },
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: mocks.selectLimit }) }),
    }),
    insert: () => ({ values: mocks.insertValues }),
    update: () => ({
      set: mocks.updateSet.mockReturnValue({ where: vi.fn() }),
    }),
  },
}));
vi.mock("@/lib/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("@/server/features/google/oauth-config", () => ({
  getGoogleOAuthClientConfig: mocks.getGoogleOAuthClientConfig,
  hasSelfHostedGoogleOAuthConfig: mocks.hasSelfHostedGoogleOAuthConfig,
}));

const user = { userId: "user-1", userEmail: "user@example.com" };
const publicOrigin = "http://localhost:3001";
const callbackURL = `${publicOrigin}/p/project/settings`;

async function authorizationState(
  integration: SelfHostedGoogleOAuthIntegration,
) {
  const url = new URL(
    await createSelfHostedGoogleAuthorizationUrl({
      integration,
      user,
      callbackURL,
      publicOrigin,
    }),
  );
  return url.searchParams.get("state")!;
}

function callbackRequest(
  integration: SelfHostedGoogleOAuthIntegration,
  state: string,
  params: Record<string, string>,
) {
  const url = new URL(integration.callbackPath, publicOrigin);
  url.searchParams.set("state", state);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url);
}

describe("self-hosted Google OAuth providers", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.selectLimit.mockReset();
    mocks.insertValues.mockReset();
    mocks.updateSet.mockReset().mockReturnValue({ where: vi.fn() });
    mocks.getAuth.mockReset();
    mocks.getGoogleOAuthClientConfig.mockResolvedValue({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
    });
    mocks.hasSelfHostedGoogleOAuthConfig.mockResolvedValue(true);
    mocks.selectLimit.mockResolvedValue([]);
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.getAuth.mockReturnValue({
      $context: Promise.resolve({
        options: { account: { encryptOAuthTokens: false } },
        secretConfig: "secret",
      }),
    });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps GSC and GA4 callback paths and scopes isolated", async () => {
    const common = { user, callbackURL, publicOrigin };
    const gscUrl = new URL(
      await createSelfHostedGoogleAuthorizationUrl({
        integration: GSC_INTEGRATION,
        ...common,
      }),
    );
    const ga4Url = new URL(
      await createSelfHostedGoogleAuthorizationUrl({
        integration: GA4_INTEGRATION,
        ...common,
      }),
    );

    expect(gscUrl.searchParams.get("redirect_uri")).toBe(
      `${publicOrigin}/api/gsc/oauth/callback`,
    );
    expect(ga4Url.searchParams.get("redirect_uri")).toBe(
      `${publicOrigin}/api/ga4/oauth/callback`,
    );
    expect(gscUrl.searchParams.get("scope")).toContain("webmasters.readonly");
    expect(ga4Url.searchParams.get("scope")).toContain("analytics.readonly");
    expect(gscUrl.searchParams.get("state")).not.toBe(
      ga4Url.searchParams.get("state"),
    );
  });

  it("keeps the YouTube grant in its own callback and scope namespace", async () => {
    const url = new URL(
      await createSelfHostedGoogleAuthorizationUrl({
        integration: YOUTUBE_INTEGRATION,
        user,
        callbackURL: "https://evil.example/path",
        publicOrigin,
      }),
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      `${publicOrigin}/api/youtube/oauth/callback`,
    );
    expect(url.searchParams.get("scope")).toBe(
      "openid email profile https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
    );
    expect(url.searchParams.get("state")).not.toBeNull();
    const state = url.searchParams.get("state")!;
    const callback = await handleSelfHostedGoogleOAuthCallback({
      integration: YOUTUBE_INTEGRATION,
      request: callbackRequest(YOUTUBE_INTEGRATION, state, {
        error: "access_denied",
      }),
      user,
      publicOrigin,
    });
    expect(callback.headers.get("Location")).toBe("/");
  });

  it("round-trips signed state, exchanges the code, and persists the GA4 grant", async () => {
    const state = await authorizationState(GA4_INTEGRATION);
    const idToken = `header.${btoa(JSON.stringify({ sub: "google-account-1" }))}.signature`;
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          scope: "openid analytics.readonly",
          id_token: idToken,
        }),
        { status: 200 },
      ),
    );

    const response = await handleSelfHostedGoogleOAuthCallback({
      integration: GA4_INTEGRATION,
      request: callbackRequest(GA4_INTEGRATION, state, { code: "code-1" }),
      user,
      publicOrigin,
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/p/project/settings");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "google-account-1",
        providerId: "google-analytics",
        userId: "user-1",
        accessToken: "access-token",
        refreshToken: "refresh-token",
      }),
    );
  });

  it("persists the YouTube grant under its dedicated provider", async () => {
    const state = await authorizationState(YOUTUBE_INTEGRATION);
    const idToken = `header.${btoa(JSON.stringify({ sub: "youtube-account-1" }))}.signature`;
    mocks.fetch.mockResolvedValue(
      Response.json({
        access_token: "youtube-access-token",
        refresh_token: "youtube-refresh-token",
        expires_in: 3600,
        scope: "openid youtube.readonly",
        id_token: idToken,
      }),
    );

    const response = await handleSelfHostedGoogleOAuthCallback({
      integration: YOUTUBE_INTEGRATION,
      request: callbackRequest(YOUTUBE_INTEGRATION, state, {
        code: "youtube-code",
      }),
      user,
      publicOrigin,
    });

    expect(response.status).toBe(303);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "youtube-account-1",
        providerId: "google-youtube",
        userId: "user-1",
        accessToken: "youtube-access-token",
        refreshToken: "youtube-refresh-token",
      }),
    );
  });

  it("encrypts self-hosted YouTube credentials when account encryption is enabled", async () => {
    mocks.getAuth.mockReturnValue({
      $context: Promise.resolve({
        options: { account: { encryptOAuthTokens: true } },
        secretConfig: "a-long-better-auth-secret-for-tests-only",
      }),
    });
    const state = await authorizationState(YOUTUBE_INTEGRATION);
    const idToken = `header.${btoa(JSON.stringify({ sub: "youtube-account-1" }))}.signature`;
    mocks.fetch.mockResolvedValue(
      Response.json({
        access_token: "raw-youtube-access-token",
        refresh_token: "raw-youtube-refresh-token",
        id_token: idToken,
      }),
    );

    await handleSelfHostedGoogleOAuthCallback({
      integration: YOUTUBE_INTEGRATION,
      request: callbackRequest(YOUTUBE_INTEGRATION, state, {
        code: "youtube-code",
      }),
      user,
      publicOrigin,
    });

    const stored = z
      .object({
        providerId: z.string(),
        accessToken: z.string(),
        refreshToken: z.string(),
      })
      .parse(mocks.insertValues.mock.calls[0]?.[0]);
    expect(stored.providerId).toBe("google-youtube");
    expect(stored.accessToken).not.toContain("raw-youtube-access-token");
    expect(stored.refreshToken).not.toContain("raw-youtube-refresh-token");
  });

  it("retains an existing YouTube refresh token when Google omits it", async () => {
    mocks.selectLimit.mockResolvedValue([
      { id: "grant-1", refreshToken: "saved-refresh-token" },
    ]);
    const state = await authorizationState(YOUTUBE_INTEGRATION);
    const idToken = `header.${btoa(JSON.stringify({ sub: "youtube-account-1" }))}.signature`;
    mocks.fetch.mockResolvedValue(
      Response.json({
        access_token: "replacement-access-token",
        expires_in: 3600,
        id_token: idToken,
      }),
    );

    await handleSelfHostedGoogleOAuthCallback({
      integration: YOUTUBE_INTEGRATION,
      request: callbackRequest(YOUTUBE_INTEGRATION, state, {
        code: "youtube-code",
      }),
      user,
      publicOrigin,
    });

    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "google-youtube",
        accessToken: "replacement-access-token",
        refreshToken: "saved-refresh-token",
      }),
    );
  });

  it.each(["tampered", "expired"])(
    "rejects %s state before token exchange",
    async (kind) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
      let state = await authorizationState(GA4_INTEGRATION);
      if (kind === "tampered") state = `${state.slice(0, -1)}x`;
      else vi.setSystemTime(new Date("2026-08-07T12:11:00Z"));

      await expect(
        handleSelfHostedGoogleOAuthCallback({
          integration: GA4_INTEGRATION,
          request: callbackRequest(GA4_INTEGRATION, state, { code: "code-1" }),
          user,
          publicOrigin,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.insertValues).not.toHaveBeenCalled();
    },
  );

  it("handles a provider denial without exchanging or persisting credentials", async () => {
    const state = await authorizationState(GA4_INTEGRATION);
    const response = await handleSelfHostedGoogleOAuthCallback({
      integration: GA4_INTEGRATION,
      request: callbackRequest(GA4_INTEGRATION, state, {
        error: "access_denied",
      }),
      user,
      publicOrigin,
    });

    expect(response.status).toBe(303);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("round-trips the GSC integration through the shared callback", async () => {
    const state = await authorizationState(GSC_INTEGRATION);
    const idToken = `header.${btoa(JSON.stringify({ sub: "gsc-account-1" }))}.signature`;
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "gsc-token", id_token: idToken }),
        { status: 200 },
      ),
    );

    const response = await handleSelfHostedGoogleOAuthCallback({
      integration: GSC_INTEGRATION,
      request: callbackRequest(GSC_INTEGRATION, state, { code: "gsc-code" }),
      user,
      publicOrigin,
    });

    expect(response.status).toBe(303);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "google-search-console",
        accountId: "gsc-account-1",
        accessToken: "gsc-token",
      }),
    );
  });
});
