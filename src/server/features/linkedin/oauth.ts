import { symmetricEncrypt } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  LINKEDIN_OAUTH_PROVIDER_ID,
  LINKEDIN_OAUTH_SCOPES,
} from "@/shared/linkedin";
import { z } from "zod";
const AUTH = "https://www.linkedin.com/oauth/v2/authorization",
  TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";
const stateSchema = z.object({
  userId: z.string().min(1),
  callback: z
    .string()
    .startsWith("/")
    .refine((value) => !value.startsWith("//")),
  exp: z.number().int(),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  sub: z.string().min(1).optional(),
});
const enc = new TextEncoder();
const b64 = (v: string) =>
  btoa(v).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const decode = (v: string) =>
  new TextDecoder().decode(
    Uint8Array.from(
      atob(
        v.replaceAll("-", "+").replaceAll("_", "/") +
          "=".repeat((4 - (v.length % 4)) % 4),
      ),
      (c) => c.charCodeAt(0),
    ),
  );
async function config() {
  const id = (await getOptionalEnvValue("LINKEDIN_CLIENT_ID"))?.trim();
  const secret = (await getOptionalEnvValue("LINKEDIN_CLIENT_SECRET"))?.trim();
  const enabled =
    (await getOptionalEnvValue("LINKEDIN_PAGE_ANALYTICS_ENABLED"))?.trim() ===
    "true";
  const authSecret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return id && secret && enabled && authSecret
    ? { id, secret, authSecret }
    : null;
}
async function signature(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(`linkedin:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return b64(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.sign("HMAC", key, enc.encode(payload)),
      ),
    ),
  );
}
async function validSignature(payload: string, signed: string, secret: string) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(`linkedin:${secret}`),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const bytes = Uint8Array.from(
      atob(
        signed.replaceAll("-", "+").replaceAll("_", "/") +
          "=".repeat((4 - (signed.length % 4)) % 4),
      ),
      (char) => char.charCodeAt(0),
    );
    return crypto.subtle.verify("HMAC", key, bytes, enc.encode(payload));
  } catch {
    return false;
  }
}
export async function createLinkedInAuthorizationUrl(input: {
  userId: string;
  callbackURL: string;
  origin: string;
}) {
  const c = await config();
  if (!c)
    throw new Error(
      "LinkedIn Page analytics is unavailable. Configure LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, BETTER_AUTH_SECRET, and LINKEDIN_PAGE_ANALYTICS_ENABLED=true.",
    );
  const callback = new URL(input.callbackURL, input.origin);
  const safe =
    callback.origin === input.origin
      ? `${callback.pathname}${callback.search}`
      : "/";
  const payload = b64(
    JSON.stringify({
      userId: input.userId,
      callback: safe,
      exp: Date.now() + 600_000,
    }),
  );
  const state = `${payload}.${await signature(payload, c.authSecret)}`;
  const url = new URL(AUTH);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", c.id);
  url.searchParams.set(
    "redirect_uri",
    `${input.origin}/api/linkedin/oauth/callback`,
  );
  url.searchParams.set("scope", LINKEDIN_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}
export async function handleLinkedInOAuthCallback(
  request: Request,
  userId: string,
  origin: string,
) {
  const c = await config();
  if (!c)
    return new Response("LinkedIn Page analytics is not configured", {
      status: 503,
    });
  const url = new URL(request.url);
  const [payload, signed] = (url.searchParams.get("state") ?? "").split(".");
  if (
    !payload ||
    !signed ||
    !(await validSignature(payload, signed, c.authSecret))
  )
    return new Response("Invalid LinkedIn OAuth state", { status: 400 });
  let state: z.infer<typeof stateSchema>;
  try {
    state = stateSchema.parse(JSON.parse(decode(payload)));
  } catch {
    return new Response("Invalid LinkedIn OAuth state", { status: 400 });
  }
  if (state.userId !== userId)
    return new Response("LinkedIn OAuth user mismatch", { status: 403 });
  if (state.exp < Date.now())
    return new Response("Expired LinkedIn OAuth state", { status: 400 });
  if (url.searchParams.get("error"))
    return Response.redirect(new URL(state.callback, origin), 303);
  const code = url.searchParams.get("code");
  if (!code)
    return new Response("Missing LinkedIn OAuth code", { status: 400 });
  const tokenResponse = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/api/linkedin/oauth/callback`,
      client_id: c.id,
      client_secret: c.secret,
    }),
  });
  const tokens = tokenSchema.safeParse(
    await tokenResponse.json().catch(() => null),
  );
  if (!tokenResponse.ok || !tokens.success)
    return new Response("LinkedIn rejected the authorization code", {
      status: 400,
    });
  const accountId = tokens.data.sub ?? `linkedin:${userId}`;
  const auth = await getAuth().$context;
  const encrypt = (value: string) =>
    auth.options.account?.encryptOAuthTokens
      ? symmetricEncrypt({ key: auth.secretConfig, data: value })
      : value;
  const existing = await db
    .select({ id: account.id, refreshToken: account.refreshToken })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, LINKEDIN_OAUTH_PROVIDER_ID),
        eq(account.accountId, accountId),
      ),
    )
    .limit(1);
  const values = {
    userId,
    providerId: LINKEDIN_OAUTH_PROVIDER_ID,
    accountId,
    accessToken: await encrypt(tokens.data.access_token),
    refreshToken: tokens.data.refresh_token
      ? await encrypt(tokens.data.refresh_token)
      : (existing[0]?.refreshToken ?? null),
    idToken: null,
    accessTokenExpiresAt: new Date(
      Date.now() + (tokens.data.expires_in ?? 3600) * 1000,
    ),
    refreshTokenExpiresAt: null,
    scope: (tokens.data.scope ?? LINKEDIN_OAUTH_SCOPES.join(" "))
      .trim()
      .split(/\s+/)
      .join(","),
    password: null,
  };
  if (existing[0])
    await db
      .update(account)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(account.id, existing[0].id));
  else
    await db.insert(account).values({
      id: crypto.randomUUID(),
      ...values,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  return Response.redirect(new URL(state.callback, origin), 303);
}
