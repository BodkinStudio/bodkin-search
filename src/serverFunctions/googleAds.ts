import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GoogleAdsService } from "@/server/features/google-ads/GoogleAdsService";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

export const getGoogleAdsConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, currentUserHasGrant, googleClientId] = await Promise.all(
      [
        GoogleAdsService.getConnection(context.projectId),
        GoogleAdsService.userHasGrant(context.userId),
        getOptionalEnvValue("GOOGLE_CLIENT_ID"),
      ],
    );
    return {
      // Google sign-in (the OAuth client) is all a deployment needs: Google
      // Ads API access now belongs to that client's Google Cloud project.
      configured: Boolean(googleClientId?.trim()),
      currentUserHasGrant,
      connection: connection
        ? {
            customerId: connection.customerId,
            customerName: connection.customerName,
            currencyCode: connection.currencyCode,
            timeZone: connection.timeZone,
            connectedAccountEmail: connection.connectedAccountEmail,
            connectedByCurrentUser:
              connection.connectedByUserId === context.userId,
          }
        : null,
    };
  });

export const listGoogleAdsAccounts = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(({ context }) =>
    GoogleAdsService.listAccountsForUser(context.userId),
  );

export const setGoogleAdsAccount = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    projectScopedSchema.extend({
      accountId: z.string().min(1),
      customerId: z.string().regex(/^\d{10}$/),
    }),
  )
  .handler(async ({ data, context }) => {
    const row = await GoogleAdsService.setAccount({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      accountId: data.accountId,
      customerId: data.customerId,
    });
    return { customerId: row.customerId, customerName: row.customerName };
  });

export const disconnectGoogleAds = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    await GoogleAdsService.disconnect({
      projectId: context.projectId,
      userId: context.userId,
    });
    return { disconnected: true };
  });
