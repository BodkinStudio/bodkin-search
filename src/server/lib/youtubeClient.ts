import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { YOUTUBE_OAUTH_PROVIDER_ID } from "@/shared/youtube";
import {
  YouTubeApiError,
  YouTubeMalformedResponseError,
  YouTubeTokenError,
} from "./youtubeErrors";
const responseSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(256),
        snippet: z.object({
          title: z.string().min(1).max(512),
          customUrl: z.string().min(1).max(512).optional(),
        }),
      }),
    )
    .max(50)
    .default([]),
});
const userInfoSchema = z.object({
  email: z.string().email().max(512).optional(),
});
async function token(userId: string, accountId: string) {
  try {
    const result = await getAuth().api.getAccessToken({
      body: { providerId: YOUTUBE_OAUTH_PROVIDER_ID, accountId, userId },
    });
    if (!result?.accessToken) throw new Error();
    return result.accessToken;
  } catch {
    throw new YouTubeTokenError();
  }
}
export function createYouTubeClient(input: {
  userId: string;
  youtubeAccountId: string;
}) {
  let accessTokenPromise: Promise<string> | undefined;
  const accessToken = () =>
    (accessTokenPromise ??= token(input.userId, input.youtubeAccountId));

  return {
    async listChannels() {
      const bearerToken = await accessToken();
      let response: Response;
      try {
        response = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          { headers: { Authorization: `Bearer ${bearerToken}` } },
        );
      } catch {
        throw new YouTubeApiError(0, "transport");
      }
      if (!response.ok) {
        const failure =
          response.status === 401
            ? "unauthorized"
            : response.status === 403
              ? "forbidden"
              : response.status === 429
                ? "quota"
                : "upstream";
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfter = retryAfterHeader
          ? Number(retryAfterHeader)
          : Number.NaN;
        throw new YouTubeApiError(
          response.status,
          failure,
          Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null,
        );
      }
      const parsed = responseSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!parsed.success) throw new YouTubeMalformedResponseError();
      return parsed.data.items.map((item) => ({
        channelId: item.id,
        title: item.snippet.title,
        customUrl: item.snippet.customUrl ?? null,
      }));
    },
    async getUserInfoEmail() {
      const bearerToken = await accessToken();
      let response: Response;
      try {
        response = await fetch(
          "https://openidconnect.googleapis.com/v1/userinfo",
          { headers: { Authorization: `Bearer ${bearerToken}` } },
        );
      } catch {
        return null;
      }
      if (!response.ok) return null;
      const parsed = userInfoSchema.safeParse(
        await response.json().catch(() => null),
      );
      return parsed.success ? (parsed.data.email ?? null) : null;
    },
  };
}
