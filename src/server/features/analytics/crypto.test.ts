import { describe, expect, it } from "vitest";
import {
  canonicalIp,
  currentAndPreviousNetworkKeys,
  signBackendRequest,
  signIdentityAssertion,
  verifyBackendRequest,
  verifyIdentityAssertion,
} from "./crypto";
describe("analytics crypto", () => {
  it("canonicalizes mapped IPv6 and produces overlapping midnight keys", async () => {
    expect(canonicalIp("::ffff:192.0.2.1")).toBe("192.0.2.1");
    const keys = await currentAndPreviousNetworkKeys(
      "secret",
      "p",
      "192.0.2.1",
      new Date("2026-09-15T00:01:00Z"),
    );
    expect(keys.map((k) => k.epoch)).toEqual(["2026-09-15", "2026-09-14"]);
  });
  it("verifies scoped, expiring identity assertions", async () => {
    const token = await signIdentityAssertion(
      {
        projectId: "p",
        sourceId: "s",
        contextId: "00000000-0000-4000-8000-000000000001",
        issuer: "issuer",
        userId: "u",
        organizationId: "o",
        purpose: "identity",
        aud: "journey-analytics",
      },
      "secret",
    );
    await expect(
      verifyIdentityAssertion(token, "secret", {
        projectId: "p",
        sourceId: "s",
        contextId: "00000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toMatchObject({ userId: "u", organizationId: "o" });
    await expect(
      verifyIdentityAssertion(token, "secret", {
        projectId: "other",
        sourceId: "s",
        contextId: "00000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toThrow();
  });
  it("uses timestamped constant-time backend signatures", async () => {
    const timestamp = String(Date.now());
    const signature = await signBackendRequest(
      "secret",
      timestamp,
      '{"ok":true}',
    );
    await expect(
      verifyBackendRequest("secret", timestamp, '{"ok":true}', signature),
    ).resolves.toBe(true);
    await expect(
      verifyBackendRequest("secret", timestamp, "tampered", signature),
    ).resolves.toBe(false);
  });
});
