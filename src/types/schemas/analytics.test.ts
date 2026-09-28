import { describe, expect, it } from "vitest";
import { event } from "@/server/features/analytics/collection-test-fixture";
import { journeyEventSchema } from "./analytics";

const valid = (overrides: object) =>
  journeyEventSchema.safeParse({ ...event(), ...overrides }).success;
describe("journey event IDs by mode", () => {
  it("rejects IDs on anonymous events and requires one on consented events", () => {
    expect(valid({ mode: "anonymous" })).toBe(false);
    expect(valid({ contextId: undefined })).toBe(false);
    expect(valid({ mode: "anonymous", contextId: undefined })).toBe(true);
  });
});
