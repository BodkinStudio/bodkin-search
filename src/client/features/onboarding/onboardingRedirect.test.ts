import { describe, expect, it } from "vitest";
import { shouldRedirectToOnboarding } from "./onboardingRedirect";

const unfinished = {
  hostedMode: true,
  clientWorkspaces: false,
  signedIn: true,
  emailVerified: true,
  answers: { completedAt: null },
  pathname: "/p/project/analytics",
};

describe("onboarding redirect", () => {
  it("sends a self-serve user who has not finished onboarding", () => {
    expect(shouldRedirectToOnboarding(unfinished)).toBe(true);
  });
  it("leaves invite-only client workspaces alone, whose owners never onboard", () => {
    expect(
      shouldRedirectToOnboarding({ ...unfinished, clientWorkspaces: true }),
    ).toBe(false);
  });
  it("waits until the answers have loaded", () => {
    expect(
      shouldRedirectToOnboarding({ ...unfinished, answers: undefined }),
    ).toBe(false);
  });
});
