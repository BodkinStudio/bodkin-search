import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { onboardingAnswersQueryOptions } from "@/client/features/onboarding/onboardingModel";
import { shouldRedirectToOnboarding } from "@/client/features/onboarding/onboardingRedirect";
import { useSession } from "@/lib/auth-client";
import {
  isEmailVerificationBypassed,
  isHostedClientAuthMode,
} from "@/lib/auth-mode";

export function useOnboardingRedirect() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const hostedMode = isHostedClientAuthMode();
  const clientWorkspaces = import.meta.env.CLIENT_WORKSPACES_ENABLED === "true";
  const signedIn = Boolean(session?.user?.id);
  const emailVerified =
    session?.user?.emailVerified === true || isEmailVerificationBypassed();
  const onboardingQuery = useQuery({
    ...onboardingAnswersQueryOptions(),
    enabled: hostedMode && !clientWorkspaces && signedIn && emailVerified,
  });
  const answers = onboardingQuery.isSuccess ? onboardingQuery.data : undefined;

  useEffect(() => {
    if (
      shouldRedirectToOnboarding({
        hostedMode,
        clientWorkspaces,
        signedIn,
        emailVerified,
        answers,
        pathname: window.location.pathname,
      })
    )
      void navigate({ to: "/onboarding", search: { step: 0 }, replace: true });
  }, [
    answers,
    clientWorkspaces,
    emailVerified,
    hostedMode,
    navigate,
    signedIn,
  ]);
}
