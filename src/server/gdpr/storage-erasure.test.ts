import { describe, expect, it, vi } from "vitest";
import { signGdprErasureRequest } from "@/shared/gdpr-erasure";
import type { GdprStorageErasureEnv } from "./storage-erasure";

const getAccessToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getAccessToken } }),
}));
vi.mock("@/server/features/audit/AuditScratchpad", () => ({
  getAuditScratchpad: vi.fn(),
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerError: vi.fn() }));
vi.mock("@/server/lib/r2-cache", () => ({
  AI_SEARCH_PROMPT_CACHE_NAMESPACE: "prompt-cache",
  cacheObjectPrefix: (namespace: string) => `${namespace}:`,
}));

const { handleGdprStorageErasure } = await import("./storage-erasure");

const payload = {
  userId: "user_1",
  email: "person@example.com",
  organizationIds: [],
  projectIds: [],
  samSessionIds: [],
  auditIds: [],
  activeAuditWorkflowIds: [],
  activeRankWorkflowIds: [],
  r2Keys: [],
  googleAccounts: [
    { providerId: "google-youtube", accountId: "youtube-account" },
  ],
} as const;

function emptyStorageEnv(): GdprStorageErasureEnv {
  return {
    GDPR_ERASURE_SECRET: "erase-secret",
    SITE_AUDIT_WORKFLOW: { get: vi.fn() },
    RANK_CHECK_WORKFLOW: { get: vi.fn() },
    SAM_CHAT: {},
    ONBOARDING_CHAT: {},
    KV: { delete: vi.fn() },
    R2: {
      list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
      delete: vi.fn(),
    },
    OAUTH_KV: {
      list: vi.fn().mockResolvedValue({ keys: [], list_complete: true }),
      delete: vi.fn(),
    },
  };
}

describe("handleGdprStorageErasure", () => {
  it("revokes a YouTube grant through Google's shared token-revoke endpoint without returning credentials", async () => {
    getAccessToken.mockResolvedValue({ accessToken: "raw-access-token" });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify(payload);
    const timestamp = String(Date.now());
    const signature = await signGdprErasureRequest(
      "erase-secret",
      timestamp,
      body,
    );
    const request = new Request(
      "https://open-seo.test/api/internal/gdpr-erasure/storage",
      {
        method: "POST",
        headers: {
          "content-length": String(new TextEncoder().encode(body).byteLength),
          "x-gdpr-timestamp": timestamp,
          "x-gdpr-signature": signature,
        },
        body,
      },
    );

    const response = await handleGdprStorageErasure(request, emptyStorageEnv());

    expect(response.status).toBe(200);
    expect(getAccessToken).toHaveBeenCalledWith({
      body: {
        userId: "user_1",
        providerId: "google-youtube",
        accountId: "youtube-account",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/revoke",
      expect.objectContaining({ method: "POST" }),
    );
    const revokeBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(revokeBody).toBeInstanceOf(URLSearchParams);
    if (!(revokeBody instanceof URLSearchParams)) {
      throw new Error("Expected URL-encoded revocation body");
    }
    expect(revokeBody.toString()).toBe("token=raw-access-token");
    const responseBody = await response.text();
    expect(responseBody).toContain('"providerId":"google-youtube"');
    expect(responseBody).not.toContain("raw-access-token");
    expect(responseBody).not.toContain("erase-secret");
  });
});
