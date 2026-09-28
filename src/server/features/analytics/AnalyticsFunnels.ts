import {
  configuredStages,
  reportingSettings,
} from "./AnalyticsReportingConfiguration";
import { AnalyticsRepository as repo } from "./AnalyticsRepository";
import type { AnalyticsQuery } from "@/types/schemas/analytics";
export async function funnels(q: AnalyticsQuery) {
  const window = repo.windowFor(q);
  const reporting = await reportingSettings(q.projectId);
  const definitions = await configuredStages(
    q.projectId,
    q.template ?? "external",
  );
  const completionMs = reporting.completionWindowDays * 86400_000;
  const extended = {
    ...q,
    to: new Date(
      Math.min(Date.now(), Date.parse(window.to) + completionMs),
    ).toISOString(),
  };
  const [events, config] = await Promise.all([
    repo.events(extended),
    repo.settings(q.projectId),
  ]);
  const names = definitions.map((s) => s.event);
  const groups = new Map<string, typeof events>();
  for (const event of events) {
    const history = groups.get(event.contextId) ?? [];
    history.push(event);
    groups.set(event.contextId, history);
  }
  const counts = names.map(() => 0);
  const stages = names.map((name, i) => ({
    name,
    label: definitions[i].label,
    count: 0,
    coverage:
      definitions[i].instrumented || events.some((e) => e.name === name)
        ? "Observed"
        : "Not observed",
  }));
  // Steps nobody tracks are skipped rather than treated as a wall: "not
  // observed" means coverage is unknown, so it must not zero every later
  // step (a click then a trial still counts when the app's own steps are not
  // instrumented).
  const tracked = stages.flatMap((s, i) =>
    s.coverage === "Observed" ? [i] : [],
  );
  const incomplete = tracked.length < stages.length;
  const cohorts: {
    contextId: string;
    enteredAt: string;
    stage: number;
    status: string;
  }[] = [];
  for (const [contextId, history] of groups) {
    const first = history.find(
      (e) => e.name === names[0] && e.receivedAt <= window.to,
    );
    if (!first) continue;
    let step = 0;
    for (const event of history) {
      if (
        Date.parse(event.receivedAt) - Date.parse(first.receivedAt) >
        completionMs
      )
        break;
      const stage = tracked[step];
      if (
        stage !== undefined &&
        event.name === names[stage] &&
        (!definitions[stage]?.action ||
          event.action === definitions[stage].action) &&
        (!q.action ||
          event.name !== "acquisition_clicked" ||
          event.action === q.action)
      ) {
        counts[stage]++;
        step++;
      }
    }
    const status =
      step === tracked.length
        ? incomplete
          ? "Coverage incomplete"
          : "Completed"
        : Date.now() - Date.parse(first.receivedAt) < completionMs
          ? "Pending"
          : incomplete
            ? "Coverage incomplete"
            : "Not completed";
    cohorts.push({
      contextId,
      enteredAt: first.receivedAt,
      stage: tracked[step - 1] ?? 0,
      status,
    });
  }
  return {
    template: q.template ?? "external",
    stages: stages.map((s, i) => ({ ...s, count: counts[i] })),
    cohortSize: cohorts.length,
    completed: cohorts.filter((c) => c.status === "Completed").length,
    pending: cohorts.filter((c) => c.status === "Pending").length,
    notCompleted: cohorts.filter((c) => c.status === "Not completed").length,
    unknown: cohorts.filter((c) => c.status === "Coverage incomplete").length,
    cohorts: config.personalAccess
      ? cohorts.slice(q.offset, q.offset + q.limit)
      : [],
    completionWindow: `${reporting.completionWindowDays} days`,
    definition:
      "Entry cohort in the selected period; ordered exact-context steps within the configured window, including later completions. Inferred cross-site links do not establish personal funnel steps. Missing stages mean coverage is unknown, not abandonment.",
  };
}
