import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LinkedInPageContentService } from "@/server/features/linkedin/services/LinkedInPageContentService";
import { LinkedInPageApiService } from "@/server/features/linkedin/services/LinkedInPageApiService";
import { LinkedInPageReportingService } from "@/server/features/linkedin/services/LinkedInPageReportingService";
import { createLinkedInAuthorizationUrl } from "@/server/features/linkedin/oauth";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { getRequest } from "@tanstack/react-start/server";
import { linkedinImportSchema } from "@/types/schemas/linkedin";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "./middleware";

const readSchema = z
  .object({ projectId: z.string().trim().min(1).max(200) })
  .strict();
const overviewSchema = readSchema.extend({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const importLinkedInPageContent = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(linkedinImportSchema)
  .handler(({ data, context }) =>
    LinkedInPageContentService.import({
      ...data,
      projectId: context.projectId,
    }),
  );

export const getLinkedInPageOverview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(overviewSchema)
  .handler(({ data, context }) =>
    LinkedInPageReportingService.overview({
      projectId: context.projectId,
      startDate: data.startDate,
      endDate: data.endDate,
    }),
  );

export const getLinkedInPostPerformance = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(readSchema)
  .handler(({ context }) =>
    LinkedInPageContentService.topPosts({ projectId: context.projectId }),
  );

export const getLinkedInConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(readSchema)
  .handler(async ({ context }) => ({
    connection: await LinkedInPageApiService.getConnection(context.projectId),
    currentUserHasGrant: await LinkedInPageApiService.userHasGrant(
      context.userId,
    ),
  }));
export const listLinkedInPages = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(readSchema)
  .handler(({ context }) => LinkedInPageApiService.listPages(context.userId));
export const setLinkedInPage = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    readSchema.extend({
      accountId: z.string().min(1),
      pageId: z.string().min(1),
    }),
  )
  .handler(({ data, context }) =>
    LinkedInPageApiService.selectPage({
      ...data,
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
    }),
  );
export const disconnectLinkedIn = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(readSchema)
  .handler(async ({ context }) => {
    await LinkedInPageApiService.disconnect({
      projectId: context.projectId,
      userId: context.userId,
    });
    return { connected: false as const };
  });
export const startLinkedInLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ callbackURL: z.string().min(1) }).strict())
  .handler(({ data, context }) =>
    createLinkedInAuthorizationUrl({
      userId: context.userId,
      callbackURL: data.callbackURL,
      origin: getPublicOrigin(getRequest()),
    }).then((url) => ({ url })),
  );
