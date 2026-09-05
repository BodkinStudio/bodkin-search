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
      dimensions?: "day";
      metrics: readonly string[];
    }) {
      const bearerToken = await accessToken();
      const params = new URLSearchParams({
        ids: `channel==${request.channelId}`,
        startDate: request.startDate,
        endDate: request.endDate,
        metrics: request.metrics.join(","),
      });
      if (request.dimensions) params.set("dimensions", request.dimensions);
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
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        throw new YouTubeApiError(
          response.status,
          failure,
          Number.isFinite(retryAfter) && retryAfter >= 0
            ? Math.min(retryAfter, MAX_RETRY_AFTER_SECONDS)
            : null,
          await providerReason(response),
        );
      }
      const parsed = analyticsResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!parsed.success) throw new YouTubeMalformedResponseError();
      return parsed.data;
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
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfter = retryAfterHeader
          ? Number(retryAfterHeader)
          : Number.NaN;
        throw new YouTubeApiError(
          response.status,
          failure,
          Number.isFinite(retryAfter) && retryAfter >= 0
            ? Math.min(retryAfter, MAX_RETRY_AFTER_SECONDS)
            : null,
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
