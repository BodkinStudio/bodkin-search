import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "./middleware";
import {
  requireAnalyticsAdmin,
  canAdministerAnalytics,
} from "@/server/features/analytics/AnalyticsAccess";
import {
  reportingSettings,
  saveReportingSettings,
  configuredStages,
  saveStages,
  trackingRules,
  saveTrackingRules,
} from "@/server/features/analytics/AnalyticsReportingConfiguration";
import { AnalyticsRepository as repo } from "@/server/features/analytics/AnalyticsRepository";
import { validTimezone } from "@/shared/analytics/calendar";
import { analyticsEventNames } from "@/shared/analytics/funnels";
import { analyticsQuerySchema } from "@/types/schemas/analytics";
const project = z.object({ projectId: z.string() });
const template = z.enum(["enquiry", "signup", "external", "sales"]);
export const getAnalyticsReportingSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(({ context }) => reportingSettings(context.projectId));
export const getAnalyticsCapabilities = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) => {
    const [settings, admin] = await Promise.all([
      repo.settings(context.projectId),
      canAdministerAnalytics(context.userId, context.organizationId),
    ]);
    return {
      canAdminister: admin,
      canInspect: admin && settings.personalAccess,
      inspectionEnabled: settings.personalAccess,
    };
  });
export const saveAnalyticsReportingSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    project.extend({
      timezone: z.string().max(100).refine(validTimezone),
      completionWindowDays: z.number().int().min(1).max(90),
      onboardingEvent: z.enum(analyticsEventNames),
      onboardingInstrumented: z.boolean(),
      onboardingWaitDays: z.number().int().min(1).max(90),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAnalyticsAdmin(context.userId, context.organizationId);
    return saveReportingSettings(
      { ...data, projectId: context.projectId },
      context.userId,
    );
  });
export const getAnalyticsStages = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project.extend({ template }))
  .handler(({ data, context }) =>
    configuredStages(context.projectId, data.template),
  );
export const saveAnalyticsStages = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    project.extend({
      template,
      stages: z
        .array(
          z.object({
            position: z.number().int().nonnegative(),
            label: z.string().min(1).max(100),
            event: z.enum(analyticsEventNames),
            action: z.string().min(1).max(100).nullable(),
            instrumented: z.boolean(),
          }),
        )
        .min(1)
        .max(12),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAnalyticsAdmin(context.userId, context.organizationId);
    await saveStages(
      context.projectId,
      data.template,
      data.stages,
      context.userId,
    );
    return { saved: true };
  });
export const getAnalyticsTrackingRules = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) => {
    await requireAnalyticsAdmin(context.userId, context.organizationId);
    return trackingRules(context.projectId);
  });
export const saveAnalyticsTrackingRules = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    project.extend({
      actions: z
        .array(
          z.object({
            action: z.string().min(1).max(100),
            destination: z.string().min(1).max(100),
          }),
        )
        .max(50),
      excludedPaths: z.array(z.string().startsWith("/").max(500)).max(50),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAnalyticsAdmin(context.userId, context.organizationId);
    await saveTrackingRules(context.projectId, data, context.userId);
    return { saved: true };
  });
export const getAnalyticsSearchContext = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(analyticsQuerySchema)
  .handler(async ({ data, context }) => {
    const { savedSearchContext } =
      await import("@/server/features/analytics/AnalyticsSearchContext");
    return savedSearchContext({ ...data, projectId: context.projectId });
  });
export const getAnalyticsRetainedHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(analyticsQuerySchema)
  .handler(async ({ data, context }) => {
    const { retainedDailyHistory } =
      await import("@/server/features/analytics/AnalyticsRetention");
    return retainedDailyHistory(
      context.projectId,
      data.environment,
      data.from?.slice(0, 10) ??
        new Date(Date.now() - 395 * 86400_000).toISOString().slice(0, 10),
      data.to?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    );
  });
