import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GROWTH_SETTINGS_DEFAULTS } from "@/types/schemas/growth";

vi.mock("@tanstack/react-router", () => ({ Link: "a" }));
vi.mock("@/serverFunctions/growth", () => ({
  getGrowthSettings: vi.fn(),
  updateGrowthSettings: vi.fn(),
}));
vi.mock("@/serverFunctions/growthChecks", () => ({
  getGrowthChecksOverview: vi.fn(),
}));
vi.mock("@/serverFunctions/projects", () => ({
  getProjectAccess: vi.fn(),
}));

import {
  GrowthLiveReadinessPanel,
  enabledGrowthSettingsInput,
  growthCheckHasGscConnection,
  nextGrowthLiveReadinessStep,
} from "./GrowthLiveReadiness";

const ready = {
  domain: "bodkin.studio",
  growthEnabled: true,
  keyPageCount: 3,
  gscConnected: true,
};

describe("Growth live readiness", () => {
  it("orders prerequisites so each action is executable", () => {
    expect(
      nextGrowthLiveReadinessStep({
        ...ready,
        domain: null,
        growthEnabled: false,
        keyPageCount: 0,
        gscConnected: false,
      }),
    ).toBe("domain");
    expect(
      nextGrowthLiveReadinessStep({
        ...ready,
        growthEnabled: false,
        keyPageCount: 0,
        gscConnected: false,
      }),
    ).toBe("growth");
    expect(
      nextGrowthLiveReadinessStep({
        ...ready,
        keyPageCount: 0,
        gscConnected: false,
      }),
    ).toBe("key_pages");
    expect(nextGrowthLiveReadinessStep({ ...ready, gscConnected: false })).toBe(
      "gsc",
    );
    expect(nextGrowthLiveReadinessStep(ready)).toBe("ready");
  });

  it("claims a GSC connection only for overview states that prove one", () => {
    expect(growthCheckHasGscConnection("missing_connection")).toBe(false);
    expect(growthCheckHasGscConnection("missing_key_pages")).toBe(true);
    expect(growthCheckHasGscConnection("ready")).toBe(true);
  });

  it("enables Growth without replacing stored reporting or measurement defaults", () => {
    expect(
      enabledGrowthSettingsInput("project_1", {
        projectId: "project_1",
        ...GROWTH_SETTINGS_DEFAULTS,
        reportTimezone: "Europe/London",
        defaultCooldownDays: 14,
        persisted: true,
        createdAt: "2026-09-02T10:00:00.000Z",
        updatedAt: "2026-09-02T10:00:00.000Z",
      }),
    ).toEqual({
      projectId: "project_1",
      ...GROWTH_SETTINGS_DEFAULTS,
      growthEnabled: true,
      reportTimezone: "Europe/London",
      defaultCooldownDays: 14,
    });
  });

  it("explains enablement and exposes only the current next action", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthLiveReadinessPanel, {
        projectId: "project_1",
        snapshot: { ...ready, growthEnabled: false },
        enablePending: false,
        enableError: null,
        onEnable: vi.fn(),
      }),
    );

    expect(html).toContain("Enable Growth");
    expect(html).toContain("does not run a check, schedule work or edit");
    expect(html).toContain(">Next<");
    expect(html).not.toContain("Run live check");
  });

  it("directs a fully ready project to the explicit live check", () => {
    const html = renderToStaticMarkup(
      createElement(GrowthLiveReadinessPanel, {
        projectId: "project_1",
        snapshot: ready,
        enablePending: false,
        enableError: null,
        onEnable: vi.fn(),
      }),
    );

    expect(html).toContain('href="#growth-live-check-title"');
    expect(html).toContain("Run live check");
    expect(html).toContain("genuinely useful");
    expect(html.match(/>Ready</g)).toHaveLength(4);
  });
});
