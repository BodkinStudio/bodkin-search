import { describe, expect, it } from "vitest";
import {
  matchAttribution,
  type EligibleClick,
  type ProductEntry,
} from "./matching";
const at = "2026-09-15T12:00:00.000Z";
const click = (overrides: Partial<EligibleClick> = {}) => ({
  id: "click",
  contextId: "context-a",
  projectId: "project",
  environment: "production",
  destination: "app",
  receivedAt: "2026-09-15T11:00:00.000Z",
  networkKeys: [{ epoch: "2026-09-15", key: "same" }],
  attributionPermitted: true,
  ...overrides,
});
const entry = (overrides: Partial<ProductEntry> = {}) => ({
  projectId: "project",
  environment: "production",
  destination: "app",
  receivedAt: at,
  networkKeys: [{ epoch: "2026-09-15", key: "same" }],
  attributionPermitted: true,
  ...overrides,
});
describe("matchAttribution", () => {
  it("prefers an exact context over a network candidate", () =>
    expect(
      matchAttribution(
        [click(), click({ id: "other", contextId: "other" })],
        entry({ exactContextId: "context-a" }),
      ),
    ).toMatchObject({
      method: "exact",
      clickId: "click",
      candidateGroupCount: 1,
    }));
  it("collapses repeat clicks in a single context and selects the latest", () =>
    expect(
      matchAttribution(
        [
          click({ id: "old" }),
          click({ id: "new", receivedAt: "2026-09-15T11:59:00.000Z" }),
        ],
        entry(),
      ),
    ).toMatchObject({
      method: "ip_time",
      clickId: "new",
      candidateGroupCount: 1,
      elapsedMs: 60_000,
    }));
  it("does not choose between independent network candidates", () =>
    expect(
      matchAttribution(
        [click(), click({ id: "other", contextId: "context-b" })],
        entry(),
      ),
    ).toMatchObject({
      method: "unattributed",
      candidateGroupCount: 2,
      reason: "ambiguous",
    }));
  it("requires attribution permission and a shared epoch key", () => {
    expect(
      matchAttribution([click()], entry({ attributionPermitted: false })),
    ).toMatchObject({ reason: "permission_unavailable" });
    expect(
      matchAttribution(
        [click()],
        entry({ networkKeys: [{ epoch: "2026-09-14", key: "same" }] }),
      ),
    ).toMatchObject({ reason: "no_candidate" });
  });
  it("rejects later and expired clicks", () => {
    expect(
      matchAttribution(
        [click({ receivedAt: "2026-09-15T13:00:00.000Z" })],
        entry(),
      ),
    ).toMatchObject({ reason: "no_candidate" });
    expect(
      matchAttribution(
        [click({ receivedAt: "2026-09-14T11:00:00.000Z" })],
        entry(),
      ),
    ).toMatchObject({ reason: "no_candidate" });
  });
});
