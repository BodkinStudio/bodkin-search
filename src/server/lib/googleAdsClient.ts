import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { GOOGLE_ADS_OAUTH_PROVIDER_ID } from "@/shared/google-ads";
import { adsInsightQueries } from "./googleAdsInsights";

// Read-only Google Ads API client: account discovery, campaign spend, and
// click lookups (which campaign a gclid came from). Every call is a GAQL
// search; nothing here mutates an account.

const DEFAULT_API_VERSION = "v25";

export class GoogleAdsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

export class GoogleAdsTokenError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "GoogleAdsTokenError";
  }
}

const errorSchema = z
  .object({
    error: z
      .object({
        message: z.string().optional(),
        details: z
          .array(
            z
              .object({
                errors: z
                  .array(
                    z
                      .object({
                        errorCode: z.record(z.string(), z.string()).optional(),
                        message: z.string().optional(),
                      })
                      .passthrough(),
                  )
                  .optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

/** Ten digits, no dashes ("123-456-7890" → "1234567890"); null when not a customer id. */
export function normalizeCustomerId(value: string | null | undefined) {
  const digits = (value ?? "").replace(/-/g, "").trim();
  return /^\d{10}$/.test(digits) ? digits : null;
}

async function accessToken(userId: string, googleAccountId: string) {
  let result: { accessToken?: string } | undefined;
  try {
    result = await getAuth().api.getAccessToken({
      body: {
        providerId: GOOGLE_ADS_OAUTH_PROVIDER_ID,
        userId,
        accountId: googleAccountId,
      },
    });
  } catch (error) {
    throw new GoogleAdsTokenError(
      "Could not mint a Google Ads access token.",
      error,
    );
  }
  if (!result?.accessToken)
    throw new GoogleAdsTokenError("Google Ads returned no access token.");
  return result.accessToken;
}

function messageForStatus(status: number, reason?: string) {
  if (
    reason === "DEVELOPER_TOKEN_NOT_APPROVED" ||
    reason === "PROJECT_NOT_APPROVED" ||
    reason === "ACCESS_LEVEL_NOT_APPROVED"
  )
    return "This Google Cloud project only has test access to the Google Ads API. In Google Cloud Console, open Google Ads API → Upgrade access level → Apply for access (Explorer is enough to read spend).";
  if (reason === "SERVICE_DISABLED" || reason === "API_DISABLED")
    return "The Google Ads API is not enabled in this Google Cloud project. Enable it in Google Cloud Console (APIs & Services → Library).";
  if (status === 401) return "Google Ads connection expired.";
  if (status === 403)
    return "Google Ads denied access. Check the signed-in account can see this Ads account.";
  if (status === 429) return "Google Ads rate limit reached.";
  return `Google Ads API error (${status}).`;
}

export function createGoogleAdsClient(opts: {
  userId: string;
  googleAccountId: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let token: Promise<string> | undefined;
  const request = async (
    path: string,
    init: {
      method: "GET" | "POST";
      body?: unknown;
      loginCustomerId?: string | null;
    },
  ) => {
    // No developer token: Google retired them on 9 Sep 2026. Access comes
    // from the Google Cloud project behind the OAuth client.
    const version =
      (await getOptionalEnvValue("GOOGLE_ADS_API_VERSION"))?.trim() ||
      DEFAULT_API_VERSION;
    token ??= accessToken(opts.userId, opts.googleAccountId);
    const response = await fetchImpl(
      `https://googleads.googleapis.com/${version}/${path}`,
      {
        method: init.method,
        headers: {
          authorization: `Bearer ${await token}`,
          ...(init.loginCustomerId
            ? { "login-customer-id": init.loginCustomerId }
            : {}),
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const json: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const parsed = errorSchema.safeParse(json);
      const first = parsed.success
        ? parsed.data.error.details?.[0]?.errors?.[0]
        : undefined;
      const reason = first?.errorCode
        ? Object.values(first.errorCode)[0]
        : undefined;
      throw new GoogleAdsApiError(
        messageForStatus(response.status, reason),
        response.status,
        reason,
      );
    }
    return json;
  };

  /** Every row of a GAQL query, following page tokens (bounded). */
  const search = async (
    customerId: string,
    query: string,
    loginCustomerId?: string | null,
  ) => {
    const rows: Record<string, unknown>[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page++) {
      const json = z
        .object({
          results: z.array(z.record(z.string(), z.unknown())).optional(),
          nextPageToken: z.string().optional(),
        })
        .parse(
          await request(`customers/${customerId}/googleAds:search`, {
            method: "POST",
            body: { query, ...(pageToken ? { pageToken } : {}) },
            loginCustomerId,
          }),
        );
      rows.push(...(json.results ?? []));
      pageToken = json.nextPageToken;
      if (!pageToken) break;
    }
    return rows;
  };

  const customerRow = z.object({
    customer: z.object({
      id: z.string(),
      descriptiveName: z.string().optional(),
      currencyCode: z.string().optional(),
      timeZone: z.string().optional(),
      manager: z.boolean().optional(),
    }),
  });
  const clientRow = z.object({
    customerClient: z.object({
      id: z.string(),
      descriptiveName: z.string().optional(),
      currencyCode: z.string().optional(),
      timeZone: z.string().optional(),
      manager: z.boolean().optional(),
      level: z.union([z.string(), z.number()]).optional(),
    }),
  });

  return {
    /**
     * Ads accounts this sign-in can read: each directly accessible account,
     * and, for a manager account, the accounts directly under it (reached
     * with the manager as login customer).
     */
    async listAccounts() {
      const listed = z
        .object({ resourceNames: z.array(z.string()).optional() })
        .parse(
          await request("customers:listAccessibleCustomers", { method: "GET" }),
        );
      const ids = (listed.resourceNames ?? []).map((name) =>
        name.replace("customers/", ""),
      );
      const accounts: {
        customerId: string;
        loginCustomerId: string | null;
        name: string;
        currencyCode: string;
        timeZone: string;
        manager: boolean;
      }[] = [];
      for (const id of ids.slice(0, 50)) {
        try {
          const [row] = await search(
            id,
            "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1",
          );
          const c = customerRow.parse(row).customer;
          if (!c.manager) {
            accounts.push({
              customerId: c.id,
              loginCustomerId: null,
              name: c.descriptiveName ?? c.id,
              currencyCode: c.currencyCode ?? "",
              timeZone: c.timeZone ?? "UTC",
              manager: false,
            });
            continue;
          }
          const clients = await search(
            id,
            "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.level FROM customer_client WHERE customer_client.level = 1 AND customer_client.status = 'ENABLED'",
            id,
          );
          for (const raw of clients) {
            const cc = clientRow.parse(raw).customerClient;
            if (cc.manager) continue;
            accounts.push({
              customerId: cc.id,
              loginCustomerId: id,
              name: cc.descriptiveName ?? cc.id,
              currencyCode: cc.currencyCode ?? "",
              timeZone: cc.timeZone ?? "UTC",
              manager: false,
            });
          }
        } catch (error) {
          // A suspended or inaccessible account never hides the others.
          if (error instanceof GoogleAdsTokenError) throw error;
          if (
            error instanceof GoogleAdsApiError &&
            (error.status === 401 || error.status === 503)
          )
            throw error;
        }
      }
      return accounts;
    },

    /** Spend, clicks and impressions per campaign over a date range (account time zone, YYYY-MM-DD). */
    async campaignSpend(
      account: { customerId: string; loginCustomerId: string | null },
      from: string,
      to: string,
    ) {
      const rows = await search(
        account.customerId,
        `SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}' AND metrics.impressions > 0`,
        account.loginCustomerId,
      );
      const row = z.object({
        campaign: z.object({ id: z.string(), name: z.string().optional() }),
        metrics: z
          .object({
            costMicros: z.string().optional(),
            clicks: z.string().optional(),
            impressions: z.string().optional(),
          })
          .optional(),
      });
      return rows.map((raw) => {
        const r = row.parse(raw);
        return {
          campaignId: r.campaign.id,
          campaignName: r.campaign.name ?? r.campaign.id,
          spend: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
          clicks: Number(r.metrics?.clicks ?? 0),
          impressions: Number(r.metrics?.impressions ?? 0),
        };
      });
    },

    ...adsInsightQueries(search),

    /** The campaign a Google click id came from; click_view needs the click's date (account time zone). */
    async clickCampaign(
      account: { customerId: string; loginCustomerId: string | null },
      gclid: string,
      date: string,
    ) {
      if (!/^[\w.~-]{1,200}$/.test(gclid) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
        return null;
      const [raw] = await search(
        account.customerId,
        `SELECT click_view.gclid, campaign.id, campaign.name, ad_group.name, click_view.keyword_info.text FROM click_view WHERE segments.date = '${date}' AND click_view.gclid = '${gclid}' LIMIT 1`,
        account.loginCustomerId,
      );
      if (!raw) return null;
      const r = z
        .object({
          campaign: z.object({ id: z.string(), name: z.string().optional() }),
          adGroup: z.object({ name: z.string().optional() }).optional(),
          clickView: z
            .object({
              keywordInfo: z.object({ text: z.string().optional() }).optional(),
            })
            .optional(),
        })
        .parse(raw);
      return {
        campaignId: r.campaign.id,
        campaignName: r.campaign.name ?? r.campaign.id,
        adGroupName: r.adGroup?.name ?? null,
        keyword: r.clickView?.keywordInfo?.text ?? null,
      };
    },

    async userInfoEmail() {
      token ??= accessToken(opts.userId, opts.googleAccountId);
      const response = await fetchImpl(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: { authorization: `Bearer ${await token}` },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) return null;
      const parsed = z
        .object({ email: z.string().optional() })
        .safeParse(await response.json());
      return parsed.success ? (parsed.data.email ?? null) : null;
    },
  };
}
