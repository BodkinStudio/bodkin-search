import { beforeEach, describe, expect, it, vi } from "vitest";
import { whoamiTool } from "./whoami";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  isHostedServerAuthMode: vi.fn(),
  usageMeteringDisabled: vi.fn(),
  check: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));
vi.mock("@/server/billing/subscription", () => ({
  usageMeteringDisabled: mocks.usageMeteringDisabled,
}));
vi.mock("@/server/billing/autumn", () => ({
  autumn: { check: mocks.check },
}));

describe("whoami MCP tool", () => {
  beforeEach(() => {
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.check.mockRejectedValue(new Error("no billing customer"));
  });

  // Agents read a zero balance as "every paid tool is blocked".
  it("reports unmetered usage instead of a zero balance", async () => {
    mocks.usageMeteringDisabled.mockResolvedValue(true);
    const result = await whoamiTool.handler({}, makeToolContext());
    expect(result.structuredContent).toMatchObject({
      usageMetered: false,
      creditsRemaining: null,
    });
  });

  it("reports an unknown balance when the lookup fails", async () => {
    mocks.usageMeteringDisabled.mockResolvedValue(false);
    const result = await whoamiTool.handler({}, makeToolContext());
    expect(result.structuredContent).toMatchObject({
      usageMetered: true,
      creditsRemaining: null,
    });
  });
});
