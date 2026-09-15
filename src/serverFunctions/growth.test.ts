import { describe, expect, it, vi } from "vitest";
import { getGrowthSettings, updateGrowthSettings } from "./growth";

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
}));

describe("Growth settings server functions", () => {
  it("exposes callable project-authorized read and update boundaries", () => {
    expect(getGrowthSettings).toBeTypeOf("function");
    expect(updateGrowthSettings).toBeTypeOf("function");
  });
});
