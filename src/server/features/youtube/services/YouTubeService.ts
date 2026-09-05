import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import { createYouTubeClient } from "@/server/lib/youtubeClient";
import {
  YouTubeApiError,
  type YouTubeApiFailure,
  YouTubeMalformedResponseError,
  YouTubeTokenError,
} from "@/server/lib/youtubeErrors";
import { YOUTUBE_OAUTH_PROVIDER_ID } from "@/shared/youtube";
import { YouTubeConnectionRepository } from "../repositories/YouTubeConnectionRepository";
async function grants(userId: string) {
  return db
    .select({ accountId: account.accountId, scope: account.scope })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, YOUTUBE_OAUTH_PROVIDER_ID),
      ),
    );
}
async function getConnection(projectId: string) {
  return YouTubeConnectionRepository.getByProjectId(projectId);
}
async function userHasGrant(userId: string) {
  return (await grants(userId)).length > 0;
}

function hasAnalyticsScope(scope: string | null) {
  return (scope ?? "")
    .split(/[\s,]+/)
    .includes("https://www.googleapis.com/auth/yt-analytics.readonly");
}

async function getAnalyticsConnectionStatus(projectId: string) {
  const connection = await getConnection(projectId);
  if (!connection)
    return { status: "not_connected" as const, connection: null };
  const grant = (await grants(connection.connectedByUserId)).find(
    (item) => item.accountId === connection.youtubeAccountId,
  );
  if (!grant || !hasAnalyticsScope(grant.scope)) {
    return { status: "reconnect_required" as const, connection };
  }
  return { status: "ready" as const, connection };
}

async function getYouTubeConnection(projectId: string) {
  const status = await getAnalyticsConnectionStatus(projectId);
  return status.connection
    ? { ...status.connection, analyticsReady: status.status === "ready" }
    : null;
}

type YouTubeUnavailableReason =
  | Exclude<YouTubeApiFailure, "unauthorized">
  | "malformed"
  | null;

function unavailableReason(error: unknown): YouTubeUnavailableReason {
  if (error instanceof YouTubeApiError && error.failure !== "unauthorized") {
    return error.failure;
  }
  if (error instanceof YouTubeMalformedResponseError) return "malformed";
  if (
    error instanceof YouTubeTokenError ||
    (error instanceof YouTubeApiError && error.status === 401)
  ) {
    return null;
  }
  return "upstream" as const;
}

async function listChannelsForUser(userId: string) {
  const accounts = await Promise.all(
    (await grants(userId)).map(async ({ accountId }) => {
      try {
        const client = createYouTubeClient({
          userId,
          youtubeAccountId: accountId,
        });
        const channels = await client.listChannels();
        return {
          accountId,
          email: await client.getUserInfoEmail(),
          requiresReconnect: false,
          unavailable: null,
          channels,
        };
      } catch (error) {
        return {
          accountId,
          email: null,
          requiresReconnect:
            error instanceof YouTubeTokenError ||
            (error instanceof YouTubeApiError && error.status === 401),
          unavailable: unavailableReason(error),
          channels: [],
        };
      }
    }),
  );
  return { accounts };
}
async function setChannel(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  accountId: string;
  channelId: string;
}) {
  if (
    !(await grants(input.userId)).some(
      (grant) => grant.accountId === input.accountId,
    )
  )
    throw new AppError(
      "NOT_FOUND",
      "That Google account isn't connected to your OpenSEO account.",
    );
  const client = createYouTubeClient({
    userId: input.userId,
    youtubeAccountId: input.accountId,
  });
  const channels = await client.listChannels();
  const channel = channels.find((item) => item.channelId === input.channelId);
  if (!channel)
    throw new AppError(
      "NOT_FOUND",
      "That YouTube channel isn't available on your connected Google account.",
    );
  return YouTubeConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    channelId: channel.channelId,
    channelTitle: channel.title,
    channelCustomUrl: channel.customUrl,
    connectedByUserId: input.userId,
    youtubeAccountId: input.accountId,
    connectedAccountEmail: await client.getUserInfoEmail(),
  });
}
async function disconnect(input: { projectId: string; userId: string }) {
  const connection = await getConnection(input.projectId);
  await YouTubeConnectionRepository.deleteByProjectId(input.projectId);
  if (
    connection?.connectedByUserId === input.userId &&
    !(await YouTubeConnectionRepository.existsForConnectorAccount(
      input.userId,
      connection.youtubeAccountId,
    ))
  )
    await db
      .delete(account)
      .where(
        and(
          eq(account.userId, input.userId),
          eq(account.providerId, YOUTUBE_OAUTH_PROVIDER_ID),
          eq(account.accountId, connection.youtubeAccountId),
        ),
      );
}
export const YouTubeService = {
  getConnection,
  userHasGrant,
  listChannelsForUser,
  setChannel,
  disconnect,
  getAnalyticsConnectionStatus,
  getYouTubeConnection,
};
