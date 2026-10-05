import {
  canAdministerAnalytics,
  requireAnalyticsAdmin as requireAdmin,
} from "@/server/features/analytics/AnalyticsAccess";
import { overviewReport } from "@/server/features/analytics/AnalyticsOverviewReport";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AnalyticsService as service } from "@/server/features/analytics/AnalyticsService";
import { analyticsQuerySchema } from "@/types/schemas/analytics";
import { requireProjectContext } from "./middleware";
const project = z.object({ projectId: z.string() });
const hostname = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/);
export const getAnalyticsOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(analyticsQuerySchema)
  .handler(({ data, context }) =>
    overviewReport({ ...data, projectId: context.projectId }),
  );
export const getAnalyticsTraffic = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(analyticsQuerySchema)
  .handler(({ data, context }) =>
    service.traffic({ ...data, projectId: context.projectId }),
  );
export const getAnalyticsMqls = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(analyticsQuerySchema)
  .handler(async ({ data, context }) => {
    const report = await service.mqls({
      ...data,
      projectId: context.projectId,
    });
    // Individual leads are personal: administrators only, as with journeys.
    if (!(await canAdministerAnalytics(context.userId, context.organizationId)))
      report.leads = null;
    return report;
  });
export const listAnalyticsJourneys = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(analyticsQuerySchema)
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.organizationId);
    return service.journeys({ ...data, projectId: context.projectId });
  });
export const getAnalyticsJourney = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(analyticsQuerySchema.extend({ contextId: z.string() }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.organizationId);
    return service.journey(
      { ...data, projectId: context.projectId },
      data.contextId,
    );
  });
export const getAnalyticsJourneyMap = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(analyticsQuerySchema)
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.organizationId);
    return service.journeyMap({ ...data, projectId: context.projectId });
  });
export const getAnalyticsCustomers = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(analyticsQuerySchema)
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.organizationId);
    return service.customers({ ...data, projectId: context.projectId });
  });
export const getAnalyticsFunnels = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(analyticsQuerySchema)
  .handler(async ({ data, context }) => {
    const report = await service.funnels({
      ...data,
      projectId: context.projectId,
    });
    if (!(await canAdministerAnalytics(context.userId, context.organizationId)))
      report.cohorts = [];
    return report;
  });
export const listAnalyticsSources = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(({ context }) => service.listSources(context.projectId));
export const getAnalyticsSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(({ context }) => service.settings(context.projectId));
export const createAnalyticsSource = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    project.extend({
      hostname,
      kind: z.enum(["website", "product", "integration"]),
      environment: z.enum(["production", "test"]),
      destination: z.string().min(1).max(100).default("product"),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.organizationId);
    return service.createSource(
      { ...data, projectId: context.projectId },
      context.userId,
    );
  });
export const saveAnalyticsSettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    project.extend({
      businessModel: z.enum(["organisation", "individual"]),
      primaryOutcome: z.enum([
        "registration_completed",
        "activation_achieved",
        "lead_qualified",
        "customer_acquired",
        "payment_succeeded",
      ]),
      matchingWindowHours: z.union([z.literal(1), z.literal(6), z.literal(24)]),
      retentionDays: z.number().int().min(7).max(90),
      customerRetentionDays: z.number().int().min(30).max(730).default(395),
      personalAccess: z.boolean(),
      anonymousCollection: z.boolean(),
      webhookUrl: z.string().url().nullable(),
      weeklyMqlTarget: z
        .number()
        .int()
        .min(1)
        .max(100000)
        .nullable()
        .optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.organizationId);
    return service.saveSettings(
      {
        ...data,
        projectId: context.projectId,
        updatedAt: new Date().toISOString(),
      },
      context.userId,
    );
  });
export const eraseAnalyticsContext = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project.extend({ contextId: z.string() }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.organizationId);
    await service.eraseContext(context.projectId, data.contextId);
    return { erased: true };
  });

export const getAnalyticsCustomerEvidence = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    project.extend({
      customerId: z.string().uuid(),
      environment: z.enum(["production", "test"]),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.organizationId);
    const { customerEvidence } =
      await import("@/server/features/analytics/AnalyticsEvidence");
    return customerEvidence(
      context.projectId,
      data.customerId,
      data.environment,
    );
  });

export const createAnalyticsDiagnosticToken = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, context.organizationId);
    const { installationToken } =
      await import("@/server/features/analytics/AnalyticsDiagnostics");
    return {
      token: await installationToken(context.projectId),
      expiresInSeconds: 600,
    };
  });

export const eraseAnalyticsCustomer = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project.extend({ customerId: z.string() }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.organizationId);
    await service.eraseCustomer(context.projectId, data.customerId);
    return { erased: true };
  });

export const getAnalyticsAcquisitionDimensions = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(analyticsQuerySchema)
  .handler(async ({ data, context }) => {
    const { acquisitionDimensions } =
      await import("@/server/features/analytics/AnalyticsAcquisition");
    return acquisitionDimensions({ ...data, projectId: context.projectId });
  });

export const correctAnalyticsAttribution = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    project.extend({
      customerId: z.string(),
      expectedVersion: z.number().int().nonnegative(),
      clickEventId: z.string().uuid().nullable(),
      reason: z.string().trim().min(10).max(500),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.organizationId);
    const { correctAttribution } =
      await import("@/server/features/analytics/AnalyticsCorrection");
    return correctAttribution({
      ...data,
      projectId: context.projectId,
      actorId: context.userId,
    });
  });
