import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  analyticsReportingSettings,
  analyticsFunnelStages,
  analyticsAudit,
  analyticsExcludedPaths,
  analyticsActions,
} from "@/db/schema";
import {
  defaultStages,
  type FunnelTemplate,
  type FunnelStage,
} from "@/shared/analytics/funnels";
export async function reportingSettings(projectId: string) {
  const [row] = await db
    .select()
    .from(analyticsReportingSettings)
    .where(eq(analyticsReportingSettings.projectId, projectId))
    .limit(1);
  return (
    row ?? {
      projectId,
      timezone: "UTC",
      completionWindowDays: 7,
      onboardingEvent: "activation_achieved",
      onboardingInstrumented: false,
      onboardingWaitDays: 7,
    }
  );
}
export function configurationAuditRows(
  projectId: string,
  actorId: string,
  entity: string,
  previous: Record<string, string | number | boolean | null | undefined>,
  next: Record<string, string | number | boolean | null | undefined>,
) {
  return Object.entries(next)
    .filter(
      ([key, value]) =>
        key !== "projectId" &&
        key !== "updatedAt" &&
        String(previous[key] ?? "") !== String(value ?? ""),
    )
    .map(([field, value]) => ({
      id: crypto.randomUUID(),
      projectId,
      actorId,
      entity,
      field,
      previousValue:
        previous[field] === undefined || previous[field] === null
          ? null
          : String(previous[field]),
      nextValue: value === null ? null : String(value),
      reason: null,
      occurredAt: new Date().toISOString(),
    }));
}
export async function saveReportingSettings(
  input: typeof analyticsReportingSettings.$inferInsert,
  actorId: string,
) {
  const previous = await reportingSettings(input.projectId);
  const audit = configurationAuditRows(
    input.projectId,
    actorId,
    "reporting",
    previous,
    input,
  );
  await runBatch((tx) => [
    tx.insert(analyticsReportingSettings).values(input).onConflictDoUpdate({
      target: analyticsReportingSettings.projectId,
      set: input,
    }),
    ...(audit.length ? [tx.insert(analyticsAudit).values(audit)] : []),
  ]);
  return reportingSettings(input.projectId);
}
export async function configuredStages(
  projectId: string,
  template: FunnelTemplate,
) {
  const rows = await db
    .select()
    .from(analyticsFunnelStages)
    .where(
      and(
        eq(analyticsFunnelStages.projectId, projectId),
        eq(analyticsFunnelStages.template, template),
      ),
    )
    .orderBy(analyticsFunnelStages.position);
  return rows.length ? rows : defaultStages(template);
}
export async function saveStages(
  projectId: string,
  template: FunnelTemplate,
  stages: FunnelStage[],
  actorId: string,
) {
  const previous = await configuredStages(projectId, template);
  const audit = stages.flatMap((stage, i) =>
    configurationAuditRows(
      projectId,
      actorId,
      `funnel:${template}:${i}`,
      previous[i] ?? {},
      stage,
    ),
  );
  await runBatch((tx) => [
    tx
      .delete(analyticsFunnelStages)
      .where(
        and(
          eq(analyticsFunnelStages.projectId, projectId),
          eq(analyticsFunnelStages.template, template),
        ),
      ),
    tx.insert(analyticsFunnelStages).values(
      stages.map((s, i) => ({
        ...s,
        position: i,
        id: crypto.randomUUID(),
        projectId,
        template,
      })),
    ),
    ...(audit.length ? [tx.insert(analyticsAudit).values(audit)] : []),
  ]);
}
export async function trackingRules(projectId: string) {
  const [actions, excludedPaths, audit] = await Promise.all([
    db
      .select()
      .from(analyticsActions)
      .where(eq(analyticsActions.projectId, projectId)),
    db
      .select()
      .from(analyticsExcludedPaths)
      .where(eq(analyticsExcludedPaths.projectId, projectId)),
    db
      .select()
      .from(analyticsAudit)
      .where(eq(analyticsAudit.projectId, projectId))
      .orderBy(desc(analyticsAudit.occurredAt))
      .limit(100),
  ]);
  return { actions, excludedPaths, audit };
}
export async function saveTrackingRules(
  projectId: string,
  input: {
    actions: { action: string; destination: string }[];
    excludedPaths: string[];
  },
  actorId: string,
) {
  const previous = await trackingRules(projectId);
  const audit = configurationAuditRows(
    projectId,
    actorId,
    "tracking-rules",
    {
      actions: previous.actions
        .map((a) => `${a.action} → ${a.destination}`)
        .join("\n"),
      excludedPaths: previous.excludedPaths.map((p) => p.prefix).join("\n"),
    },
    {
      actions: input.actions
        .map((a) => `${a.action} → ${a.destination}`)
        .join("\n"),
      excludedPaths: input.excludedPaths.join("\n"),
    },
  );
  await runBatch((tx) => [
    tx
      .delete(analyticsActions)
      .where(eq(analyticsActions.projectId, projectId)),
    ...(input.actions.length
      ? [
          tx.insert(analyticsActions).values(
            input.actions.map((a) => ({
              ...a,
              id: crypto.randomUUID(),
              projectId,
            })),
          ),
        ]
      : []),
    tx
      .delete(analyticsExcludedPaths)
      .where(eq(analyticsExcludedPaths.projectId, projectId)),
    ...(input.excludedPaths.length
      ? [
          tx.insert(analyticsExcludedPaths).values(
            input.excludedPaths.map((prefix) => ({
              id: crypto.randomUUID(),
              projectId,
              prefix,
            })),
          ),
        ]
      : []),
    ...(audit.length ? [tx.insert(analyticsAudit).values(audit)] : []),
  ]);
}
