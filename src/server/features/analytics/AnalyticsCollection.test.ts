import { describe, expect, it, vi } from "vitest";
import { safeJourneyPath } from "@/client/analytics/tracker";
import { safeAnalyticsPath } from "./AnalyticsCollection";

// The collector module loads the database; path minimisation never uses it.
vi.mock("cloudflare:workers", () => ({ env: {} }));

describe("path minimisation (browser and collector agree)", () => {
  it.each([
    [
      "/solutions/omnichannel-messaging-webex-global",
      "/solutions/omnichannel-messaging-webex-global",
    ],
    [
      "/users/jane%40example.com/orders/123456",
      "/users/:redacted/orders/:redacted",
    ],
    ["/auth/abcdef1234567890abcdef1234567890", "/auth/:redacted"],
    ["/reset/Zk3_QpL9-xYtW2vB7nMcR4sD8fGhJ1kA", "/reset/:redacted"],
    ["/invite/abcdefghijklmnopqrstuvwxyzabcdefgh", "/invite/:redacted"],
  ])("%s", (path, expected) => {
    expect(safeAnalyticsPath(path)).toBe(expected);
    expect(safeJourneyPath(path)).toBe(expected);
  });
});
