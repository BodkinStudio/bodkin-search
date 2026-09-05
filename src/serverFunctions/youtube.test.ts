import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

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
  userHasGrant: vi.fn(),
  listChannelsForUser: vi.fn(),
  setChannel: vi.fn(),
  disconnect: vi.fn(),
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
    service.getConnection.mockResolvedValue({
      channelId: "UC1",
      channelTitle: "Channel",
      channelCustomUrl: null,
      connectedByEmail: undefined,
    });
    service.userHasGrant.mockResolvedValue(true);
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
    expect(service.getConnection).toHaveBeenCalledWith("authorized-project");
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
  });
  it("starts self-hosted OAuth with the authenticated actor", async () => {
    await registeredHandler(4)({
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
      startSelfHostedYouTubeLink,
    ]).toHaveLength(5);
  });
});
