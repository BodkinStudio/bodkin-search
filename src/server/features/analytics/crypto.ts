import * as ipaddr from "ipaddr.js";
import { SignJWT, jwtVerify } from "jose";

const encoder = new TextEncoder();
const secretKey = (secret: string) => encoder.encode(secret);
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
async function mac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    secretKey(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}
function equal(left: Uint8Array, right: Uint8Array) {
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++)
    mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return mismatch === 0;
}
export function canonicalIp(ip: string) {
  return ipaddr.process(ip.trim()).toNormalizedString();
}
export async function projectEpochNetworkKey(
  secret: string,
  projectId: string,
  epoch: string,
  ip: string,
) {
  return hex(await mac(secret, `${projectId}:${epoch}:${canonicalIp(ip)}`));
}
export function dailyEpoch(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
export async function currentAndPreviousNetworkKeys(
  secret: string,
  projectId: string,
  ip: string,
  now = new Date(),
) {
  const current = dailyEpoch(now);
  const previous = dailyEpoch(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  return [
    {
      epoch: current,
      key: await projectEpochNetworkKey(secret, projectId, current, ip),
    },
    {
      epoch: previous,
      key: await projectEpochNetworkKey(secret, projectId, previous, ip),
    },
  ];
}
/**
 * The visitor key for a storage-free (anonymous) event: a keyed hash of the
 * source, day, address and browser, so the same browser on the same network
 * keeps one key for one UTC day and a new, unlinkable one the next. Nothing is
 * stored on the device and the raw address is never persisted.
 */
export async function anonymousContextKey(
  secret: string,
  visitor: {
    projectId: string;
    sourceId: string;
    ip: string;
    userAgent: string;
  },
  now = new Date(),
) {
  const { projectId, sourceId, ip, userAgent } = visitor;
  const day = dailyEpoch(now);
  const digest = hex(
    await mac(
      secret,
      `anonymous-context:v1|${projectId}|${sourceId}|${day}|${canonicalIp(ip)}|${userAgent.slice(0, 512)}`,
    ),
  );
  return `anon:${day}:${digest.slice(0, 40)}`;
}
export const isAnonymousContextKey = (key: string) => key.startsWith("anon:");
/** The contextId claim an identity assertion carries for an anonymous visitor. */
export const ANONYMOUS_CONTEXT_CLAIM = "anonymous";
export type IdentityClaims = {
  projectId: string;
  sourceId: string;
  contextId: string;
  issuer: string;
  userId: string;
  organizationId?: string;
  purpose: "identity";
  aud: "journey-analytics";
};
export async function signIdentityAssertion(
  claims: IdentityClaims,
  secret: string,
  expiresInSeconds = 300,
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(claims.issuer)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(secretKey(secret));
}
export async function verifyIdentityAssertion(
  token: string,
  secret: string,
  expected: Pick<IdentityClaims, "projectId" | "sourceId" | "contextId">,
) {
  const verified = await jwtVerify(token, secretKey(secret), {
    algorithms: ["HS256"],
    audience: "journey-analytics",
  });
  const p = verified.payload;
  if (
    p.projectId !== expected.projectId ||
    p.sourceId !== expected.sourceId ||
    p.contextId !== expected.contextId ||
    p.purpose !== "identity" ||
    typeof p.exp !== "number" ||
    typeof p.iat !== "number" ||
    p.exp - p.iat > 600 ||
    p.iat > Date.now() / 1000 + 30 ||
    typeof p.iss !== "string" ||
    typeof p.userId !== "string"
  )
    throw new Error("Invalid identity assertion claims");
  return {
    projectId: p.projectId,
    sourceId: p.sourceId,
    contextId: p.contextId,
    issuer: p.iss,
    userId: p.userId,
    organizationId:
      typeof p.organizationId === "string" ? p.organizationId : undefined,
  };
}
export async function signBackendRequest(
  secret: string,
  timestamp: string,
  body: string,
) {
  return hex(await mac(secret, `${timestamp}.${body}`));
}
export async function verifyBackendRequest(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
  options: { maxSkewMs?: number; now?: number } = {},
) {
  const { maxSkewMs = 300_000, now = Date.now() } = options;
  const ms = Number(timestamp);
  if (
    !Number.isFinite(ms) ||
    Math.abs(now - ms) > maxSkewMs ||
    !/^[0-9a-f]{64}$/i.test(signature)
  )
    return false;
  const supplied = new Uint8Array(
    signature.match(/../g)!.map((part) => Number.parseInt(part, 16)),
  );
  return equal(await mac(secret, `${timestamp}.${body}`), supplied);
}

/** Derive independent integration credentials; clients never receive the deployment root. */
export async function deriveProjectSecret(
  root: string,
  projectId: string,
  purpose: "identity" | "server" | "outbox",
) {
  return hex(await mac(root, `bodkin-analytics:v1|${purpose}|${projectId}`));
}
