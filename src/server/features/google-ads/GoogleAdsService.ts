import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account, googleAdsConnections } from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import {
  createGoogleAdsClient,
  GoogleAdsApiError,
  GoogleAdsTokenError,
  normalizeCustomerId,
} from "@/server/lib/googleAdsClient";
import { GOOGLE_ADS_OAUTH_PROVIDER_ID } from "@/shared/google-ads";

// Google Ads per project: which Ads account a project reads spend from. The
// grant belongs to the user (Better Auth account table); the selection to the
// project, mirroring Google Analytics.

type GoogleAdsConnection = typeof googleAdsConnections.$inferSelect;

async function getConnection(
  projectId: string,
): Promise<GoogleAdsConnection | null> {
  const rows = await db
    .select()
    .from(googleAdsConnections)
    .where(eq(googleAdsConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function listGrantsForUser(userId: string) {
  return db
    .select({ accountId: account.accountId })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, GOOGLE_ADS_OAUTH_PROVIDER_ID),
      ),
    );
}

async function userHasGrant(userId: string) {
  return (await listGrantsForUser(userId)).length > 0;
}

const requiresReconnect = (error: unknown) =>
  error instanceof GoogleAdsTokenError ||
  (error instanceof GoogleAdsApiError && error.status === 401);

async function listAccountsForUser(userId: string) {
  const grants = await listGrantsForUser(userId);
  const accounts = await Promise.all(
    grants.map(async (grant) => {
      const client = createGoogleAdsClient({
        userId,
        googleAccountId: grant.accountId,
      });
      try {
        const [ads, email] = await Promise.all([
          client.listAccounts(),
          client.userInfoEmail().catch(() => null),
        ]);
        return {
          accountId: grant.accountId,
          email,
          requiresReconnect: false,
          error: null,
          ads,
        };
      } catch (error) {
        const reconnect = requiresReconnect(error);
        return {
          accountId: grant.accountId,
          email: null,
          requiresReconnect: reconnect,
          error: reconnect
            ? null
            : error instanceof Error
              ? error.message
              : "Google Ads accounts are unavailable.",
          ads: [],
        };
      }
    }),
  );
  return { accounts };
}

async function setAccount(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  accountId: string;
  customerId: string;
}) {
  const grants = await listGrantsForUser(input.userId);
  if (!grants.some((g) => g.accountId === input.accountId))
    throw new AppError(
      "NOT_FOUND",
      "That Google account isn't connected to your Bodkin Search account.",
    );
  const customerId = normalizeCustomerId(input.customerId);
  const client = createGoogleAdsClient({
    userId: input.userId,
    googleAccountId: input.accountId,
  });
  const chosen = (await client.listAccounts()).find(
    (a) => a.customerId === customerId,
  );
  if (!chosen)
    throw new AppError(
      "NOT_FOUND",
      "That Google Ads account isn't available on your connected Google account.",
    );
  const email = await client.userInfoEmail().catch(() => null);
  const values = {
    organizationId: input.organizationId,
    customerId: chosen.customerId,
    loginCustomerId: chosen.loginCustomerId,
    customerName: chosen.name,
    currencyCode: chosen.currencyCode,
    timeZone: chosen.timeZone,
    connectedByUserId: input.userId,
    googleAccountId: input.accountId,
    connectedAccountEmail: email,
  };
  const [row] = await db
    .insert(googleAdsConnections)
    .values({ id: crypto.randomUUID(), projectId: input.projectId, ...values })
    .onConflictDoUpdate({
      target: googleAdsConnections.projectId,
      set: { ...values, updatedAt: new Date().toISOString() },
    })
    .returning();
  if (!row) throw new Error("Failed to save the Google Ads connection");
  return row;
}

async function disconnect(input: { projectId: string; userId: string }) {
  const connection = await getConnection(input.projectId);
  await db
    .delete(googleAdsConnections)
    .where(eq(googleAdsConnections.projectId, input.projectId));
  if (!connection || connection.connectedByUserId !== input.userId) return;
  const stillUsed = await db
    .select({ id: googleAdsConnections.id })
    .from(googleAdsConnections)
    .where(
      and(
        eq(googleAdsConnections.connectedByUserId, input.userId),
        eq(googleAdsConnections.googleAccountId, connection.googleAccountId),
      ),
    )
    .limit(1);
  if (stillUsed.length) return;
  await db
    .delete(account)
    .where(
      and(
        eq(account.userId, input.userId),
        eq(account.providerId, GOOGLE_ADS_OAUTH_PROVIDER_ID),
        eq(account.accountId, connection.googleAccountId),
      ),
    );
}

/** A read client for a project's connected Ads account, or null when none is connected. */
async function clientFor(projectId: string) {
  const connection = await getConnection(projectId);
  if (!connection) return null;
  return {
    connection,
    client: createGoogleAdsClient({
      userId: connection.connectedByUserId,
      googleAccountId: connection.googleAccountId,
    }),
    account: {
      customerId: connection.customerId,
      loginCustomerId: connection.loginCustomerId,
    },
  };
}

export const GoogleAdsService = {
  getConnection,
  userHasGrant,
  listAccountsForUser,
  setAccount,
  disconnect,
  clientFor,
};
