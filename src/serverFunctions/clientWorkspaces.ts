import { createServerFn } from "@tanstack/react-start";
import { setCookie, getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireAuthenticatedContext } from "./middleware";
import {
  clientWorkspacesEnabled,
  requireWorkspaceMembership,
} from "@/server/features/workspaces/WorkspaceAccess";
import { listMemberships } from "@/server/features/workspaces/WorkspaceRepository";
import { WORKSPACE_COOKIE } from "@/server/features/workspaces/WorkspaceContext";
import * as service from "@/server/features/workspaces/WorkspaceService";
import { workspaceRoleSchema } from "@/shared/workspaces/permissions";

const workspaceInput = z.object({ organizationId: z.string().min(1).max(128) });
const invitationInput = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
export const getWorkspaceSession = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => ({
    enabled: clientWorkspacesEnabled(),
    organizationId: context.organizationId,
    memberships: clientWorkspacesEnabled()
      ? await listMemberships(context.userId)
      : [],
  }));
export const selectWorkspace = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(workspaceInput)
  .handler(async ({ data, context }) => {
    service.requireClientWorkspaces();
    await requireWorkspaceMembership(context.userId, data.organizationId);
    setCookie(WORKSPACE_COOKIE, data.organizationId, {
      httpOnly: true,
      secure: new URL(getRequest().url).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 86400 * 30,
    });
    return { ok: true };
  });
export const getWorkspacePeople = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(workspaceInput)
  .handler(({ data, context }) =>
    service.workspacePeople(context, data.organizationId),
  );
export const createClientWorkspace = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(workspaceInput.extend({ name: z.string().trim().min(1).max(100) }))
  .handler(({ data, context }) =>
    service.createWorkspace(context, data.organizationId, data.name),
  );
export const inviteWorkspaceMember = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    workspaceInput.extend({
      email: z.email().max(254),
      role: workspaceRoleSchema.exclude(["owner"]),
    }),
  )
  .handler(({ data, context }) =>
    service.sendInvitation(context, data.organizationId, data.email, data.role),
  );
export const updateWorkspaceMember = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    workspaceInput.extend({
      memberId: z.string().min(1),
      role: workspaceRoleSchema,
    }),
  )
  .handler(({ data, context }) =>
    service.changeMember(
      context,
      data.organizationId,
      data.memberId,
      data.role,
    ),
  );
export const removeWorkspaceMember = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(workspaceInput.extend({ memberId: z.string().min(1) }))
  .handler(({ data, context }) =>
    service.changeMember(context, data.organizationId, data.memberId, null),
  );
export const revokeWorkspaceInvitation = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(workspaceInput.extend({ invitationId: z.string().min(1) }))
  .handler(({ data, context }) =>
    service.revokeInvitation(context, data.organizationId, data.invitationId),
  );
export const getWorkspaceInvitation = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(invitationInput)
  .handler(({ data, context }) =>
    service.inspectInvitation(context, data.token),
  );
export const acceptWorkspaceInvitation = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(invitationInput)
  .handler(({ data, context }) =>
    service.acceptInvitation(context, data.token),
  );

export const resendWorkspaceInvitation = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(workspaceInput.extend({ invitationId: z.string().min(1) }))
  .handler(({ data, context }) =>
    service.resendInvitation(context, data.organizationId, data.invitationId),
  );
export const transferWorkspaceOwnership = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(workspaceInput.extend({ memberId: z.string().min(1) }))
  .handler(({ data, context }) =>
    service.transferWorkspaceOwnership(
      context,
      data.organizationId,
      data.memberId,
    ),
  );
