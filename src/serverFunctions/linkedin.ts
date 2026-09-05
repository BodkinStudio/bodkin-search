import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LinkedInPageContentService } from "@/server/features/linkedin/services/LinkedInPageContentService";
import { linkedinImportSchema } from "@/types/schemas/linkedin";
import { requireProjectContext } from "./middleware";

const readSchema = z
  .object({ projectId: z.string().trim().min(1).max(200) })
  .strict();

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
  .validator(readSchema)
  .handler(({ context }) =>
    LinkedInPageContentService.overview({ projectId: context.projectId }),
  );

export const getLinkedInPostPerformance = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(readSchema)
  .handler(({ context }) =>
    LinkedInPageContentService.topPosts({ projectId: context.projectId }),
  );
