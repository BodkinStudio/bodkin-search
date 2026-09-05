import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { hasSelfHostedGoogleOAuthConfig } from "@/server/features/google/oauth-config";
import {
  createSelfHostedGoogleAuthorizationUrl,
  YOUTUBE_INTEGRATION,
} from "@/server/features/google/selfHostedOAuth";
import { YouTubeService } from "@/server/features/youtube/services/YouTubeService";
import { YouTubeChannelOverviewService } from "@/server/features/youtube/services/YouTubeChannelOverviewService";
import { YouTubeReportError } from "@/server/lib/youtubeErrors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "./middleware";
const project = z.object({ projectId: z.string().min(1) }).strict();
export const getYouTubeConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) => {
    const [connection, currentUserHasGrant, hosted, configured] =
      await Promise.all([
        YouTubeService.getYouTubeConnection(context.projectId),
        YouTubeService.userHasGrant(context.userId),
        isHostedServerAuthMode(),
        hasSelfHostedGoogleOAuthConfig(),
      ]);
    return {
      connected: Boolean(connection),
      currentUserHasGrant,
      googleOAuthConfigured: hosted || configured,
      channelId: connection?.channelId ?? null,
      channelTitle: connection?.channelTitle ?? null,
      channelCustomUrl: connection?.channelCustomUrl ?? null,
      connectedByEmail: connection?.connectedAccountEmail ?? null,
      analyticsReady: connection?.analyticsReady ?? false,
      currentUserCanReconnect: connection?.connectedByUserId === context.userId,
    };
  });
export const listYouTubeChannels = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) => {
    const [list, connection] = await Promise.all([
      YouTubeService.listChannelsForUser(context.userId),
      YouTubeService.getConnection(context.projectId),
    ]);
    return {
      accounts: list.accounts.map((account) => ({
        ...account,
        channels: account.channels.map((channel) => ({
          ...channel,
          isSelected:
            connection?.youtubeAccountId === account.accountId &&
            connection.channelId === channel.channelId,
        })),
      })),
    };
  });
export const setYouTubeChannel = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    project.extend({
      accountId: z.string().min(1),
      channelId: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) =>
    YouTubeService.setChannel({
      ...data,
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
    }),
  );
export const disconnectYouTube = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) => {
    await YouTubeService.disconnect({
      projectId: context.projectId,
      userId: context.userId,
    });
    return { connected: false as const };
  });
const overviewInput = project
  .extend({
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();
export const getYouTubeChannelOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(overviewInput)
  .handler(async ({ data, context }) => {
    try {
      return await YouTubeChannelOverviewService.getOverview({
        projectId: context.projectId,
        startDate: data.startDate,
        endDate: data.endDate,
      });
    } catch (error) {
      if (error instanceof YouTubeReportError) {
        return {
          status: "error" as const,
          error: {
            code: error.code,
            message: error.message,
            retryAfterSeconds: error.retryAfterSeconds,
          },
        };
      }
      throw error;
    }
  });
export const startSelfHostedYouTubeLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ callbackURL: z.string().min(1) }).strict())
  .handler(async ({ data, context }) => ({
    url: await createSelfHostedGoogleAuthorizationUrl({
      integration: YOUTUBE_INTEGRATION,
      user: { userId: context.userId, userEmail: context.userEmail },
      callbackURL: data.callbackURL,
      publicOrigin: getPublicOrigin(getRequest()),
    }),
  }));
