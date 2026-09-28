import { z } from "zod";
import { getAuth } from "@/lib/auth";
import {
  LINKEDIN_MARKETING_API_VERSION,
  LINKEDIN_OAUTH_PROVIDER_ID,
  LINKEDIN_RESTLI_PROTOCOL_VERSION,
} from "@/shared/linkedin";
import { LinkedInApiError } from "./linkedinErrors";

const safeInt = z.number().int().safe();
const pageSchema = z.object({
  id: z.union([z.string().regex(/^\d{1,18}$/), safeInt]).transform(String),
  localizedName: z.string().min(1).max(512).optional(),
});
const aclSchema = z.object({
  elements: z
    .array(
      z.object({ organization: z.string().regex(/^urn:li:organization:\d+$/) }),
    )
    .max(100),
  paging: z
    .object({
      links: z
        .array(z.object({ rel: z.string(), href: z.string().max(2_000) }))
        .max(5),
    })
    .optional(),
});

export const followerStatisticsSchema = z.object({
  elements: z
    .array(
      z.object({
        followerGains: z.object({
          organicFollowerGain: safeInt,
          paidFollowerGain: safeInt,
        }),
      }),
    )
    .max(366),
});
export const pageStatisticsSchema = z.object({
  elements: z
    .array(
      z.object({
        totalPageStatistics: z.object({
          views: z.object({ allPageViews: z.object({ pageViews: safeInt }) }),
        }),
      }),
    )
    .max(366),
});
export const shareStatisticsSchema = z.object({
  elements: z
    .array(
      z.object({
        totalShareStatistics: z.object({
          impressionCount: safeInt,
          uniqueImpressionsCount: safeInt,
          clickCount: safeInt,
          likeCount: safeInt,
          commentCount: safeInt,
          shareCount: safeInt,
        }),
      }),
    )
    .max(366),
});

function retryAfter(response: Response) {
  const header = response.headers.get("retry-after");
  if (header === null) return null;
  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 86_400) : null;
}
function nextPath(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.protocol === "https:" &&
      url.hostname === "api.linkedin.com" &&
      url.pathname.startsWith("/rest/")
      ? `${url.pathname}${url.search}`
      : null;
  } catch {
    return null;
  }
}
async function token(userId: string, accountId: string) {
  try {
    const result = await getAuth().api.getAccessToken({
      body: { userId, providerId: LINKEDIN_OAUTH_PROVIDER_ID, accountId },
    });
    if (!result?.accessToken) throw new Error("missing token");
    return result.accessToken;
  } catch {
    throw new LinkedInApiError("unauthorized", 401);
  }
}
export function createLinkedInClient(connection: {
  userId: string;
  linkedinAccountId: string;
}) {
  let access: Promise<string> | undefined;
  const request = async (path: string): Promise<unknown> => {
    if (!path.startsWith("/rest/")) throw new LinkedInApiError("malformed");
    const accessToken = await (access ??= token(
      connection.userId,
      connection.linkedinAccountId,
    ));
    let response: Response;
    try {
      response = await fetch(`https://api.linkedin.com${path}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Linkedin-Version": LINKEDIN_MARKETING_API_VERSION,
          "X-Restli-Protocol-Version": LINKEDIN_RESTLI_PROTOCOL_VERSION,
        },
      });
    } catch {
      throw new LinkedInApiError("transport");
    }
    if (!response.ok)
      throw new LinkedInApiError(
        response.status === 401
          ? "unauthorized"
          : response.status === 403 || response.status === 404
            ? "forbidden"
            : response.status === 429
              ? "rate_limited"
              : "upstream",
        response.status,
        retryAfter(response),
      );
    return response.json().catch(() => {
      throw new LinkedInApiError("malformed");
    });
  };
  return {
    request,
    async listAdminPages() {
      const pages: Array<{ pageId: string; pageName: string }> = [];
      let path: string | null =
        "/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100";
      for (let index = 0; path && index < 5; index += 1) {
        const acl = aclSchema.safeParse(await request(path));
        if (!acl.success) throw new LinkedInApiError("malformed");
        for (const item of acl.data.elements) {
          const id = item.organization.slice("urn:li:organization:".length);
          const page = pageSchema.safeParse(
            await request(`/rest/organizations/${encodeURIComponent(id)}`),
          );
          if (!page.success) throw new LinkedInApiError("malformed");
          pages.push({
            pageId: page.data.id,
            pageName: page.data.localizedName ?? page.data.id,
          });
        }
        const next = acl.data.paging?.links.find(
          (link) => link.rel === "next",
        )?.href;
        path = nextPath(next);
        if (next && !path) throw new LinkedInApiError("malformed");
      }
      return pages;
    },
  };
}
