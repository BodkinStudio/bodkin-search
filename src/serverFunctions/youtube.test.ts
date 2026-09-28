import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { YouTubeReportError } from "@/server/lib/youtubeErrors";

const registration = vi.hoisted(() => ({
  handlers: [] as Array<
    (input: {
      data: unknown;
      context: {
        projectId: string;
        organizationId: string;
        userId: string;
        userEmail: string;
      };
    }) => Promise<unknown>
  >,
}));
const service = vi.hoisted(() => ({
  getConnection: vi.fn(),
  getYouTubeConnection: vi.fn(),
  userHasGrant: vi.fn(),
  listChannelsForUser: vi.fn(),
  setChannel: vi.fn(),
  disconnect: vi.fn(),
  getOverview: vi.fn(),
  getVideoPerformance: vi.fn(),
  getTrafficSources: vi.fn(),
}));
const oauth = vi.hoisted(() => ({ create: vi.fn(), configured: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: (schema: z.ZodType) => ({
        handler: (
          handler: (input: {
            data: unknown;
            context: {
              projectId: string;
              organizationId: string;
              userId: string;
              userEmail: string;
            };
          }) => Promise<unknown>,
        ) => {
          registration.handlers.push(handler);
          return async (input: {
            data: unknown;
            context: {
              projectId: string;
              organizationId: string;
              userId: string;
              userEmail: string;
            };
          }) => {
            schema.parse(input.data);
            return handler(input);
          };
        },
      }),
    }),
  }),
}));
vi.mock("./middleware", () => ({
  requireProjectContext: [],
  requireAuthenticatedContext: [],
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://app.test"),
}));
vi.mock("@/server/features/youtube/services/YouTubeService", () => ({
  YouTubeService: service,
}));
vi.mock(
  "@/server/features/youtube/services/YouTubeChannelOverviewService",
  () => ({
    YouTubeChannelOverviewService: { getOverview: service.getOverview },
  }),
);
vi.mock(
  "@/server/features/youtube/services/YouTubeContentAnalyticsService",
  () => ({
    YouTubeContentAnalyticsService: {
      getVideoPerformance: service.getVideoPerformance,
      getTrafficSources: service.getTrafficSources,
    },
  }),
);
vi.mock("@/server/features/google/oauth-config", () => ({
  hasSelfHostedGoogleOAuthConfig: oauth.configured,
}));
vi.mock("@/server/features/google/selfHostedOAuth", () => ({
  YOUTUBE_INTEGRATION: { providerId: "google-youtube" },
  createSelfHostedGoogleAuthorizationUrl: oauth.create,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/server/mcp/public-origin", () => ({
  getPublicOrigin: () => "https://app.test",
}));

import {
  disconnectYouTube,
  getYouTubeConnection,
  getYouTubeChannelOverview,
  getYouTubeTrafficSources,
  getYouTubeVideoPerformance,
  listYouTubeChannels,
  setYouTubeChannel,
  startSelfHostedYouTubeLink,
} from "./youtube";
const context = {
  projectId: "authorized-project",
  organizationId: "authorized-org",
  userId: "authorized-user",
  userEmail: "person@example.com",
};

type AsyncCall = (input: unknown) => Promise<unknown>;

function isAsyncCall(value: unknown): value is AsyncCall {
  return typeof value === "function";
}

function invoke(value: unknown, input: unknown) {
  if (!isAsyncCall(value)) throw new Error("Expected an async server function");
  return value(input);
}

function registeredHandler(index: number) {
  const value = registration.handlers[index];
  if (!value) throw new Error(`Missing registered handler ${index}`);
  return value;
}

describe("YouTube server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getYouTubeConnection.mockResolvedValue({
      channelId: "UC1",
      channelTitle: "Channel",
      channelCustomUrl: null,
      connectedByEmail: undefined,
      connectedByUserId: "authorized-user",
    });
    service.userHasGrant.mockResolvedValue(true);
    service.getOverview.mockResolvedValue({ status: "ok" });
    service.getVideoPerformance.mockResolvedValue({ status: "ok" });
    service.getTrafficSources.mockResolvedValue({ status: "ok" });
    service.listChannelsForUser.mockResolvedValue({
      accounts: [
        {
          accountId: "a1",
          email: "person@example.com",
          requiresReconnect: false,
          unavailable: null,
          channels: [],
        },
      ],
    });
    oauth.configured.mockResolvedValue(true);
    oauth.create.mockResolvedValue("https://accounts.google.test/auth");
  });
  it("derives project, organization, and user from middleware context", async () => {
    await registeredHandler(0)({
      data: { projectId: "forged" },
      context,
    });
    await registeredHandler(1)({
      data: { projectId: "forged" },
      context,
    });
    await registeredHandler(2)({
      data: { projectId: "forged", accountId: "a1", channelId: "UC1" },
      context,
    });
    await registeredHandler(3)({
      data: { projectId: "forged" },
      context,
    });
    expect(service.getYouTubeConnection).toHaveBeenCalledWith(
      "authorized-project",
    );
    expect(service.listChannelsForUser).toHaveBeenCalledWith("authorized-user");
    expect(service.setChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "authorized-project",
        organizationId: "authorized-org",
        userId: "authorized-user",
      }),
    );
    expect(service.disconnect).toHaveBeenCalledWith({
      projectId: "authorized-project",
      userId: "authorized-user",
    });
  });
  it("validates strict request shapes and returns public DTOs", async () => {
    await expect(
      invoke(getYouTubeConnection, {
        data: { projectId: "p", token: "forged" },
      }),
    ).rejects.toThrow();
    await expect(
      invoke(setYouTubeChannel, {
        data: {
          projectId: "p",
          accountId: "a",
          channelId: "c",
          userId: "forged",
        },
      }),
    ).rejects.toThrow();
    const value = await registeredHandler(0)({
      data: { projectId: "p" },
      context,
    });
    expect(value).not.toHaveProperty("accessToken");
    expect(value).not.toHaveProperty("refreshToken");
    expect(value).toMatchObject({ currentUserCanReconnect: true });
  });
  it("starts self-hosted OAuth with the authenticated actor", async () => {
    await registeredHandler(7)({
      data: { callbackURL: "/settings" },
      context,
    });
    expect(oauth.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { userId: "authorized-user", userEmail: "person@example.com" },
      }),
    );
    expect([
      getYouTubeConnection,
      listYouTubeChannels,
      setYouTubeChannel,
      disconnectYouTube,
      getYouTubeChannelOverview,
      getYouTubeVideoPerformance,
      getYouTubeTrafficSources,
      startSelfHostedYouTubeLink,
    ]).toHaveLength(8);
  });
  it("uses the authorized project for the channel overview", async () => {
    await registeredHandler(4)({
      data: {
        projectId: "forged",
        startDate: "2026-08-01",
        endDate: "2026-08-28",
      },
      context,
    });
    expect(service.getOverview).toHaveBeenCalledWith({
      projectId: "authorized-project",
      startDate: "2026-08-01",
      endDate: "2026-08-28",
    });
    expect(getYouTubeChannelOverview).toBeDefined();
  });
  it("serializes report errors without provider details", async () => {
    service.getOverview.mockRejectedValue(
      new YouTubeReportError(
        "youtube_reconnect_required",
        "Reconnect the YouTube channel.",
        60,
      ),
    );
    await expect(
      registeredHandler(4)({ data: { projectId: "forged" }, context }),
    ).resolves.toEqual({
      status: "error",
      error: {
        code: "youtube_reconnect_required",
        message: "Reconnect the YouTube channel.",
        retryAfterSeconds: 60,
      },
    });
  });
  it("uses authorized project context for both content reports", async () => {
    await registeredHandler(5)({ data: { projectId: "forged" }, context });
    await registeredHandler(6)({ data: { projectId: "forged" }, context });
    expect(service.getVideoPerformance).toHaveBeenCalledWith({
      projectId: "authorized-project",
      startDate: undefined,
      endDate: undefined,
    });
    expect(service.getTrafficSources).toHaveBeenCalledWith({
      projectId: "authorized-project",
      startDate: undefined,
      endDate: undefined,
    });
  });
});
