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
const videoMetadataSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.string().min(1).max(256),
          snippet: z.object({
            title: z.string().min(1).max(512),
            publishedAt: z.string().datetime({ offset: true }).max(64),
            thumbnails: z
              .record(
                z.string(),
                z.object({ url: z.string().url().max(2_048) }),
              )
              .optional(),
          }),
        }),
      )
      .max(10)
      .default([]),
  })
  .superRefine((value, context) => {
    const ids = value.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Video metadata IDs must be unique",
      });
  });
const userInfoSchema = z.object({
  email: z.string().email().max(512).optional(),
});
const analyticsHeaderSchema = z.object({
  name: z.string().min(1).max(128),
  columnType: z.string().min(1).max(64),
  dataType: z.string().min(1).max(64),
});
const analyticsResponseSchema = z.object({
  columnHeaders: z.array(analyticsHeaderSchema).max(32),
  rows: z.array(z.array(z.unknown()).max(32)).max(200).optional().default([]),
});
const providerErrorSchema = z.object({
  error: z
    .object({
      status: z.string().max(128).optional(),
      errors: z
        .array(z.object({ reason: z.string().max(128).optional() }))
        .max(8)
        .optional(),
    })
    .optional(),
});
const MAX_RETRY_AFTER_SECONDS = 86_400;

function retryAfterSeconds(response: Response) {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const delta = Number(header);
  if (Number.isFinite(delta) && delta >= 0)
    return Math.min(delta, MAX_RETRY_AFTER_SECONDS);
  const date = Date.parse(header);
  if (!Number.isFinite(date)) return null;
  return Math.min(
    Math.max(0, Math.ceil((date - Date.now()) / 1_000)),
    MAX_RETRY_AFTER_SECONDS,
  );
}

async function providerReason(response: Response) {
  const body = await response.text().catch(() => "");
  if (body.length > 8_000) return null;
  const parsed = providerErrorSchema.safeParse(
    (() => {
      try {
        const value: unknown = JSON.parse(body);
        return value;
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success) return null;
  const reasons = [
    parsed.data.error?.status,
    ...(parsed.data.error?.errors?.map((item) => item.reason) ?? []),
  ];
  const normalized = reasons
    .filter(Boolean)
    .map((reason) => reason?.replace(/[^a-z]/gi, "").toLowerCase());
  if (
    normalized.some((reason) =>
      ["servicedisabled", "accessnotconfigured"].includes(reason ?? ""),
    )
  )
    return "SERVICE_DISABLED" as const;
  if (
    normalized.some((reason) =>
      ["insufficientpermissions"].includes(reason ?? ""),
    )
  )
    return "INSUFFICIENT_PERMISSIONS" as const;
  if (
    normalized.some((reason) =>
      [
        "quotaexceeded",
        "dailylimitexceeded",
        "ratelimitexceeded",
        "userratelimitexceeded",
      ].includes(reason ?? ""),
    )
  )
    return "QUOTA_EXCEEDED" as const;
  if (
    normalized.some((reason) =>
      ["invalidargument", "invalidquery", "badrequest"].includes(reason ?? ""),
    )
  )
    return "REPORT_INCOMPATIBLE" as const;
  return null;
}
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
export function createYouTubeClient(connection: {
  userId: string;
  youtubeAccountId: string;
}) {
  let accessTokenPromise: Promise<string> | undefined;
  const accessToken = () =>
    (accessTokenPromise ??= token(
      connection.userId,
      connection.youtubeAccountId,
    ));

  return {
    async queryAnalytics(request: {
      channelId: string;
      startDate: string;
      endDate: string;
      dimensions?: "day" | "video" | "insightTrafficSourceType";
      metrics: readonly string[];
      filters?: string;
      sort?: string;
      maxResults?: number;
    }) {
      const bearerToken = await accessToken();
      const params = new URLSearchParams({
        ids: `channel==${request.channelId}`,
        startDate: request.startDate,
        endDate: request.endDate,
        metrics: request.metrics.join(","),
      });
      if (request.dimensions) params.set("dimensions", request.dimensions);
      if (request.filters) params.set("filters", request.filters);
      if (request.sort) params.set("sort", request.sort);
      if (request.maxResults != null) {
        if (
          !Number.isInteger(request.maxResults) ||
          request.maxResults < 1 ||
          request.maxResults > 25
        )
          throw new YouTubeMalformedResponseError();
        params.set("maxResults", String(request.maxResults));
      }
      let response: Response;
      try {
        response = await fetch(
          `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
          { headers: { Authorization: `Bearer ${bearerToken}` } },
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError")
          throw new YouTubeApiError(0, "transport");
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
        throw new YouTubeApiError(
          response.status,
          failure,
          retryAfterSeconds(response),
          await providerReason(response),
        );
      }
      const parsed = analyticsResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!parsed.success) throw new YouTubeMalformedResponseError();
      return parsed.data;
    },
    async listVideos(videoIds: readonly string[]) {
      if (videoIds.length > 10 || videoIds.some((id) => !id || id.length > 256))
        throw new YouTubeMalformedResponseError();
      if (videoIds.length === 0) return [];
      const bearerToken = await accessToken();
      const params = new URLSearchParams({
        part: "snippet",
        id: videoIds.join(","),
      });
      let response: Response;
      try {
        response = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
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
        throw new YouTubeApiError(
          response.status,
          failure,
          retryAfterSeconds(response),
          await providerReason(response),
        );
      }
      const parsed = videoMetadataSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!parsed.success) throw new YouTubeMalformedResponseError();
      return parsed.data.items.map((item) => ({
        videoId: item.id,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        thumbnailUrl:
          item.snippet.thumbnails?.maxres?.url ??
          item.snippet.thumbnails?.high?.url ??
          item.snippet.thumbnails?.medium?.url ??
          item.snippet.thumbnails?.default?.url ??
          null,
      }));
    },
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
        throw new YouTubeApiError(
          response.status,
          failure,
          retryAfterSeconds(response),
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
