import {
  clientWorkspacesEnabled,
  requireWorkspaceMembership,
} from "@/server/features/workspaces/WorkspaceAccess";
import policy from "@/server/features/workspaces/server-function-policy.json";
import { workspaceCapabilitySchema } from "@/shared/workspaces/permissions";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import type { EnsuredProject } from "@/middleware/ensure-user/types";
import { AppError } from "@/server/lib/errors";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";

const operationPolicy = new Map(Object.entries(policy));

function extractProjectId(data: unknown) {
  if (!data || typeof data !== "object" || !("projectId" in data)) {
    return null;
  }

  const projectId = (data as { projectId?: unknown }).projectId;
  return typeof projectId === "string" && projectId.length > 0
    ? projectId
    : null;
}

export const ensureUserMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next, data, serverFnMeta }) => {
  const context = await resolveUserContextFromHeaders(getRequest().headers);

  const projectId = extractProjectId(data);

  if (clientWorkspacesEnabled()) {
    const key = `${serverFnMeta.filename}:${serverFnMeta.name}`;
    const rule = operationPolicy.get(key);
    if (
      !rule ||
      rule.capability === "blocked" ||
      (rule.projectRequired && !projectId)
    )
      throw new AppError(
        "FORBIDDEN",
        "This action is unavailable in client workspaces.",
      );
    if (rule.capability !== "self")
      await requireWorkspaceMembership(
        context.userId,
        context.organizationId,
        workspaceCapabilitySchema.parse(rule.capability),
      );
  }

  let project: EnsuredProject | undefined;

  if (projectId) {
    // ADR 0001 intentionally keeps project authorization here so every
    // project-scoped server function gets the same request-scoped org+project
    // check before handlers run. Function-level middleware narrows the type.
    project = await ProjectRepository.getProjectForOrganization(
      projectId,
      context.organizationId,
    );

    if (!project) {
      throw new AppError("NOT_FOUND");
    }
  }

  return next({
    context: {
      ...context,
      project,
    },
  });
});
