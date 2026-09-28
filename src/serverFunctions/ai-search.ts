import { createServerFn } from "@tanstack/react-start";
import { getBrandLookup } from "@/server/features/ai-search/services/brandLookup";
import { explorePrompt as runExplorePrompt } from "@/server/features/ai-search/services/promptExplorer";
import {
  getSavedPromptExplorerSnapshot,
  listSavedPromptExplorerSnapshots,
} from "@/server/features/ai-search/services/promptExplorerSnapshots";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  brandLookupInputSchema,
  promptExplorerInputSchema,
} from "@/types/schemas/ai-search";
import { z } from "zod";

/**
 * AI Visibility endpoints are gated behind the paid plan in hosted mode
 * because each call fans out to several paid DataForSEO requests. Self-hosted
 * deployments pay DataForSEO directly and aren't gated.
 */
async function assertPaidPlan(organizationId: string) {
  if (!(await isHostedServerAuthMode())) return;
  if (await customerHasPaidPlan(organizationId)) return;
  throw new AppError(
    "PAYMENT_REQUIRED",
    "Upgrade to the paid plan to use AI Visibility",
  );
}

export const lookupBrand = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(brandLookupInputSchema)
  .handler(async ({ data, context }) => {
    await assertPaidPlan(context.organizationId);
    return getBrandLookup({ ...data, projectId: context.projectId }, context);
  });

export const explorePrompt = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(promptExplorerInputSchema)
  .handler(async ({ data, context }) => {
    await assertPaidPlan(context.organizationId);
    return runExplorePrompt({ ...data, projectId: context.projectId }, context);
  });

export const listPromptExplorerSnapshots = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(({ context }) =>
    listSavedPromptExplorerSnapshots(context.projectId),
  );

export const getPromptExplorerSnapshot = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(
    z.object({ projectId: z.string().min(1), snapshotId: z.string().uuid() }),
  )
  .handler(({ data, context }) =>
    getSavedPromptExplorerSnapshot(context.projectId, data.snapshotId),
  );
