/** Leaf module so the decision is testable without the app's server functions. */
export function shouldRedirectToOnboarding(state: {
  hostedMode: boolean;
  clientWorkspaces: boolean;
  signedIn: boolean;
  emailVerified: boolean;
  /** Undefined until the answers have loaded successfully. */
  answers: { completedAt: string | null } | undefined;
  pathname: string;
}) {
  return (
    state.hostedMode &&
    // Client workspaces are invite-only: owners carried over from Cloudflare
    // Access and invited clients never go through self-serve onboarding.
    !state.clientWorkspaces &&
    state.signedIn &&
    state.emailVerified &&
    state.answers !== undefined &&
    !state.answers.completedAt &&
    state.pathname !== "/onboarding"
  );
}
