import { env } from "cloudflare:workers";
import {
  collectBatchSchema,
  serverEventSchema,
} from "@/types/schemas/analytics";
import { AnalyticsService } from "./AnalyticsService";
import { deriveProjectSecret, verifyBackendRequest } from "./crypto";
import { db } from "@/db";
import { analyticsSources } from "@/db/schema";
import { and, eq } from "drizzle-orm";
export async function analyticsCors(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return null;
  }
  const [source] = await db
    .select({ id: analyticsSources.id })
    .from(analyticsSources)
    .where(
      and(
        eq(analyticsSources.hostname, host),
        eq(analyticsSources.enabled, true),
      ),
    )
    .limit(1);
  return source
    ? {
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
      }
    : null;
}
async function limitedBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 60000)
    throw new Error("Request too large");
  const reader = request.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    const chunk: unknown = part.value;
    if (!(chunk instanceof Uint8Array))
      throw new Error("Invalid request stream");
    size += chunk.byteLength;
    if (size > 60000) {
      await reader.cancel();
      throw new Error("Request too large");
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
export async function handleCollect(request: Request) {
  const headers = await analyticsCors(request);
  if (!headers)
    return Response.json({ error: "Origin not registered" }, { status: 403 });
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  try {
    const parsed = collectBatchSchema.parse(
      JSON.parse(await limitedBody(request)),
    );
    const cf = "cf" in request && request.cf;
    const source = await db
      .select()
      .from(analyticsSources)
      .where(eq(analyticsSources.id, parsed.events[0].sourceId))
      .limit(1);
    if (!source[0] || parsed.events.some((e) => e.sourceId !== source[0].id))
      throw new Error("One source per batch required");
    const result = await AnalyticsService.collect({
      events: parsed.events,
      origin: request.headers.get("origin"),
      observedIp: cf ? request.headers.get("cf-connecting-ip") : null,
      userAgent: request.headers.get("user-agent"),
      secrets: {
        networkSecret: env.ANALYTICS_NETWORK_HMAC_SECRET,
        identitySecret: env.ANALYTICS_IDENTITY_ASSERTION_SECRET
          ? await deriveProjectSecret(
              env.ANALYTICS_IDENTITY_ASSERTION_SECRET,
              source[0].projectId,
              "identity",
            )
          : undefined,
      },
    });
    return Response.json(result, { status: 202, headers });
  } catch {
    return Response.json(
      {
        error:
          "Event rejected: check envelope, registered action, consent and identity signature",
      },
      { status: 400, headers },
    );
  }
}
export async function handleServerEvent(request: Request) {
  try {
    const body = await limitedBody(request);
    if (!env.ANALYTICS_SERVER_EVENT_SECRET)
      return Response.json(
        { error: "Integration is not configured" },
        { status: 503 },
      );
    const event = serverEventSchema.parse(JSON.parse(body));
    const valid = await verifyBackendRequest(
      await deriveProjectSecret(
        env.ANALYTICS_SERVER_EVENT_SECRET,
        event.projectId,
        "server",
      ),
      request.headers.get("x-bodkin-timestamp") ?? "",
      body,
      request.headers.get("x-bodkin-signature") ?? "",
    );
    if (!valid)
      return Response.json(
        { error: "Invalid event signature" },
        { status: 401 },
      );
    return Response.json(await AnalyticsService.recordOutcome(event), {
      status: 202,
    });
  } catch {
    return Response.json(
      {
        error:
          "Outcome rejected: check schema, verified identity and financial references",
      },
      { status: 400 },
    );
  }
}
