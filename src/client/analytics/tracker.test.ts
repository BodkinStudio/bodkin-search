import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  initJourneyTracker,
  safeJourneyPath,
  type JourneyConsent,
} from "./tracker";
describe("tracker path minimisation", () => {
  it("keeps readable static pages while redacting identity and token segments", () => {
    expect(safeJourneyPath("/product/pricing")).toBe("/product/pricing");
    expect(safeJourneyPath("/users/jane%40example.com/orders/123456")).toBe(
      "/users/:redacted/orders/:redacted",
    );
    expect(safeJourneyPath("/auth/abcdef1234567890abcdef1234567890")).toBe(
      "/auth/:redacted",
    );
    expect(safeJourneyPath("/%E0%A4%A")).toBe("/:redacted");
  });
});

const batch = z.object({ events: z.array(z.record(z.string(), z.unknown())) });
const denied: JourneyConsent = {
  analytics: false,
  attribution: false,
  identity: false,
  policyVersion: "v1",
};
function anonymousTracker() {
  const stored = new Map<string, string>();
  const sent: Record<string, unknown>[] = [];
  const listeners = {
    addEventListener() {},
    removeEventListener() {},
  };
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("location", new URL("https://site.test/pricing"));
  vi.stubGlobal("history", { pushState() {}, replaceState() {} });
  vi.stubGlobal("window", listeners);
  vi.stubGlobal("document", {
    ...listeners,
    referrer: "",
    visibilityState: "visible",
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const body: unknown = JSON.parse(init.body);
    sent.push(...batch.parse(body).events);
    return new Response(null, { status: 202 });
  });
  let grant: ((state: JourneyConsent) => void) | undefined;
  const tracker = initJourneyTracker({
    projectKey: "project",
    sourceId: crypto.randomUUID(),
    collectorUrl: "https://collector.test/collect",
    anonymous: true,
    consent: {
      getState: () => denied,
      subscribe(listener) {
        grant = listener;
        return () => {};
      },
    },
  });
  const delivered = (count: number) =>
    vi.waitFor(async () => {
      await tracker.flush();
      expect(sent).toHaveLength(count);
    });
  return {
    tracker,
    stored,
    sent,
    delivered,
    grant: (s: JourneyConsent) => grant?.(s),
  };
}

describe("anonymous tracking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("stores nothing on the device and sends no visitor or session IDs", async () => {
    const { tracker, stored, sent, delivered } = anonymousTracker();
    tracker.track("acquisition_clicked", { action: "start_trial" });
    tracker.identify("assertion");
    await delivered(3);
    expect(sent.map((e) => e.name)).toEqual([
      "page_view",
      "acquisition_clicked",
      "identity_known",
    ]);
    for (const e of sent) {
      expect(e.mode).toBe("anonymous");
      expect(e).not.toHaveProperty("contextId");
      expect(e).not.toHaveProperty("sessionId");
    }
    expect(tracker.getContextId()).toBeNull();
    expect(stored.size).toBe(0);
    tracker.destroy();
  });
  it("switches to a stored visitor ID once consent is granted", async () => {
    const { tracker, stored, sent, delivered, grant } = anonymousTracker();
    await delivered(1);
    grant({ ...denied, analytics: true });
    tracker.track("acquisition_clicked", { action: "start_trial" });
    await delivered(2);
    expect(sent[1]).toMatchObject({ contextId: tracker.getContextId() });
    expect(sent[1]).not.toHaveProperty("mode");
    expect(stored.size).toBe(1);
    tracker.destroy();
  });
});
