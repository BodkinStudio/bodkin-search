import { it, expect } from "vitest";
import { onboardingStatus } from "./onboarding";
const base = {
  startedAt: "2026-09-01T12:00:00Z",
  completedAt: null,
  waitDays: 7,
  asOf: "2026-09-15T12:00:00Z",
};
it("does not call uninstrumented completion abandoned", () =>
  expect(onboardingStatus({ ...base, instrumented: false }).status).toBe(
    "No completion observation after 14 days; tracking coverage unknown",
  ));
it("keeps pending windows distinct from observed noncompletion", () => {
  expect(
    onboardingStatus({
      ...base,
      instrumented: true,
      asOf: "2026-09-03T12:00:00Z",
    }).status,
  ).toBe("Still within completion window");
  expect(onboardingStatus({ ...base, instrumented: true }).status).toBe(
    "No completion observed after 14 days",
  );
});
it("accepts observed completion despite missing configuration and never invents a start", () => {
  expect(
    onboardingStatus({
      ...base,
      instrumented: false,
      completedAt: "2026-09-02T12:00:00Z",
    }).status,
  ).toBe("Completed");
  expect(
    onboardingStatus({ ...base, instrumented: true, startedAt: null }).status,
  ).toBe("Onboarding start not observed");
});
