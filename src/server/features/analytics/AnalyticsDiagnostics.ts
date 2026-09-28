import { db } from "@/db";
import { analyticsSources } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { env } from "cloudflare:workers";
import { canonicalIp } from "./crypto";
export async function installationToken(projectId: string) {
  const secret = env.ANALYTICS_NETWORK_HMAC_SECRET;
  if (!secret) throw new Error("Configure ANALYTICS_NETWORK_HMAC_SECRET first");
  return new SignJWT({ projectId, purpose: "installation-diagnostic" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("analytics-diagnostics")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
}
export async function diagnoseNetwork(request: Request) {
  const secret = env.ANALYTICS_NETWORK_HMAC_SECRET;
  if (!secret)
    return Response.json(
      { error: "Network matching is not configured" },
      { status: 503 },
    );
  try {
    const token =
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"], audience: "analytics-diagnostics" },
    );
    if (
      payload.purpose !== "installation-diagnostic" ||
      typeof payload.exp !== "number" ||
      typeof payload.projectId !== "string"
    )
      throw new Error("Invalid diagnostic token");
    const origin = request.headers.get("origin");
    if (origin) {
      const [source] = await db
        .select({ id: analyticsSources.id })
        .from(analyticsSources)
        .where(
          and(
            eq(analyticsSources.projectId, payload.projectId),
            eq(analyticsSources.hostname, new URL(origin).hostname),
            eq(analyticsSources.enabled, true),
          ),
        )
        .limit(1);
      if (!source)
        throw new Error("Origin is not registered for diagnostic project");
    }
    const ip =
      "cf" in request && request.cf
        ? request.headers.get("cf-connecting-ip")
        : null;
    return Response.json(
      {
        address: ip ? canonicalIp(ip) : null,
        family: ip ? (canonicalIp(ip).includes(":") ? "ipv6" : "ipv4") : null,
        note: "Temporary installation diagnostic. Do not save the address in reports. Local development has no trusted edge address.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Expired or invalid installation token" },
      { status: 401 },
    );
  }
}
