import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  gdprStorageErasurePayloadSchema,
  signGdprErasureRequest,
} from "./gdpr-erasure";

describe("GDPR erasure request", () => {
  it("signs the timestamp and exact body with HMAC SHA-256", async () => {
    const secret = "test-secret";
    const timestamp = "1770000000000";
    const body = '{"userId":"user_1"}';
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    await expect(signGdprErasureRequest(secret, timestamp, body)).resolves.toBe(
      expected,
    );
  });
});

describe("GDPR storage erasure payload", () => {
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
  };

  it("accepts the dedicated YouTube Google grant", () => {
    expect(
      gdprStorageErasurePayloadSchema.safeParse({
        ...payload,
        googleAccounts: [
          { providerId: "google-youtube", accountId: "youtube-account" },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects unknown Google grant providers", () => {
    expect(
      gdprStorageErasurePayloadSchema.safeParse({
        ...payload,
        googleAccounts: [
          { providerId: "google-unknown", accountId: "account" },
        ],
      }).success,
    ).toBe(false);
  });
});
