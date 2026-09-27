export function onboardingStatus(input: {
  startedAt: string | null;
  completedAt: string | null;
  instrumented: boolean;
  waitDays: number;
  asOf: string;
}) {
  if (input.completedAt)
    return {
      status: "Completed",
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      elapsedDays: null,
      coverage: input.instrumented ? "Configured" : "Completion observed",
    };
  if (!input.startedAt)
    return {
      status: "Onboarding start not observed",
      startedAt: null,
      completedAt: null,
      elapsedDays: null,
      coverage: input.instrumented ? "Configured" : "Unknown",
    };
  const elapsedDays = Math.max(
    0,
    Math.floor(
      (Date.parse(input.asOf) - Date.parse(input.startedAt)) / 86400_000,
    ),
  );
  return {
    status: input.instrumented
      ? elapsedDays < input.waitDays
        ? "Still within completion window"
        : `No completion observed after ${elapsedDays} days`
      : `No completion observation after ${elapsedDays} days; tracking coverage unknown`,
    startedAt: input.startedAt,
    completedAt: null,
    elapsedDays,
    coverage: input.instrumented ? "Configured" : "Unknown",
  };
}
