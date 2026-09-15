import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSamResearchDraft,
  readSamResearchDraft,
  saveSamResearchDraft,
} from "./samResearchDraft";

const items = new Map<string, string>();
beforeEach(() => {
  clearSamResearchDraft("session-a");
  clearSamResearchDraft("blocked-session");
  items.clear();
  vi.stubGlobal("window", {});
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
    removeItem: (key: string) => items.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("SAM research draft handoff", () => {
  it("scopes draft reads to the project and session and retains until explicitly cleared", () => {
    saveSamResearchDraft("project-a", "session-a", "Review evidence");
    expect(readSamResearchDraft("project-b", "session-a")).toBe("");
    expect(readSamResearchDraft("project-a", "session-b")).toBe("");
    expect(readSamResearchDraft("project-a", "session-a")).toBe(
      "Review evidence",
    );
    expect(readSamResearchDraft("project-a", "session-a")).toBe(
      "Review evidence",
    );
    clearSamResearchDraft("session-a");
    expect(readSamResearchDraft("project-a", "session-a")).toBe("");
  });
  it("opens a project-scoped in-memory draft when storage writes fail", () => {
    vi.stubGlobal("sessionStorage", {
      setItem: () => {
        throw new Error("quota");
      },
      getItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() =>
      saveSamResearchDraft(
        "project-a",
        "blocked-session",
        "Review this evidence",
      ),
    ).not.toThrow();
    expect(readSamResearchDraft("project-a", "blocked-session")).toBe(
      "Review this evidence",
    );
    expect(readSamResearchDraft("project-b", "blocked-session")).toBe("");
    clearSamResearchDraft("blocked-session");
    expect(readSamResearchDraft("project-a", "blocked-session")).toBe("");
  });

  it("ignores corrupt or inaccessible storage and rejects oversized handoffs", () => {
    items.set("sam-research-draft:session-a", "not-json");
    expect(readSamResearchDraft("project-a", "session-a")).toBe("");
    expect(() =>
      saveSamResearchDraft("project-a", "session-a", "x".repeat(30001)),
    ).toThrow();
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    expect(readSamResearchDraft("project-a", "session-a")).toBe("");
    expect(() => clearSamResearchDraft("session-a")).not.toThrow();
  });
});
