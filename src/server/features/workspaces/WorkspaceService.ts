import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { env } from "cloudflare:workers";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invitation, member, user, workspaceAudit } from "@/db/schema";
import { runBatch } from "@/db/runBatch";
import { AppError } from "@/server/lib/errors";
import {
  canManageRole,
  workspaceRoleSchema,
  type WorkspaceRole,
} from "@/shared/workspaces/permissions";
import {
  clientWorkspacesEnabled,
  requireWorkspaceMembership,
} from "./WorkspaceAccess";
import * as repo from "./WorkspaceRepository";

type Actor = { userId: string; userEmail: string; emailVerified: boolean };
export function requireClientWorkspaces() {
  if (!clientWorkspacesEnabled()) throw new AppError("FORBIDDEN");
}
export async function workspacePeople(actor: Actor, organizationId: string) {
  requireClientWorkspaces();
  const membership = await requireWorkspaceMembership(
    actor.userId,
    organizationId,
    "manage_people",
  );
  const workspace = await repo.getWorkspace(organizationId);
  if (workspace?.status !== "active") throw new AppError("NOT_FOUND");
  return {
    workspace,
    role: membership.role,
    invitationsEnabled:
      env.WORKSPACE_INVITATIONS_ENABLED === "true" &&
      !!env.LOOPS_API_KEY &&
      !!env.LOOPS_TRANSACTIONAL_WORKSPACE_INVITE_ID &&
      !!env.WORKSPACE_APP_URL,
    ...(await repo.listPeople(organizationId)),
  };
}
export async function createWorkspace(
  actor: Actor,
  sourceOrganizationId: string,
  name: string,
) {
  requireClientWorkspaces();
  await requireWorkspaceMembership(actor.userId, sourceOrganizationId, "own");
  const source = await repo.getWorkspace(sourceOrganizationId);
  if (source?.status !== "active") throw new AppError("NOT_FOUND");
  const id = await repo.createWorkspaceRecord(
    actor.userId,
    sourceOrganizationId,
    name,
    source.payerOrganizationId,
  );
  await requireWorkspaceMembership(actor.userId, id, "own");
  return { id };
}
export async function changeMember(
  actor: Actor,
  organizationId: string,
  memberId: string,
  role: WorkspaceRole | null,
) {
  requireClientWorkspaces();
  const own = await requireWorkspaceMembership(
    actor.userId,
    organizationId,
    "manage_people",
  );
  const [target] = await db
    .select()
    .from(member)
    .where(
      and(eq(member.id, memberId), eq(member.organizationId, organizationId)),
    );
  if (!target || !canManageRole(own.role, target.role, role ?? undefined))
    throw new AppError("FORBIDDEN");
  await repo.updateMemberRole(organizationId, actor.userId, memberId, role);
  const [after] = await db.select().from(member).where(eq(member.id, memberId));
  if ((role && after?.role !== role) || (!role && after))
    return {
      ok: false as const,
      reason:
        "Keep at least one owner. Your permissions may also have changed.",
    };
  return { ok: true as const };
}
async function tokenHash(token: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function sendInvitation(
  actor: Actor,
  organizationId: string,
  email: string,
  role: WorkspaceRole,
) {
  requireClientWorkspaces();
  if (
    env.WORKSPACE_INVITATIONS_ENABLED !== "true" ||
    !env.LOOPS_API_KEY ||
    !env.LOOPS_TRANSACTIONAL_WORKSPACE_INVITE_ID ||
    !env.WORKSPACE_APP_URL
  ) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "Invitations are not enabled. Configure the workspace invitation email sender before inviting clients.",
    );
  }
  if (!actor.emailVerified) throw new AppError("FORBIDDEN");
  const own = await requireWorkspaceMembership(
    actor.userId,
    organizationId,
    "manage_people",
  );
  if (!canManageRole(own.role, role) || role === "owner")
    throw new AppError("FORBIDDEN");
  const workspace = await repo.getWorkspace(organizationId);
  if (workspace?.status !== "active") throw new AppError("NOT_FOUND");
  const normalizedEmail = email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        sql`lower(${user.email}) = ${normalizedEmail}`,
      ),
    );
  if (existing)
    return { ok: false as const, reason: "This person is already a member." };
  const origin = new URL(env.WORKSPACE_APP_URL);
  if (origin.protocol !== "https:")
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "Workspace invitations require an HTTPS application URL.",
    );
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const id = await tokenHash(token);
  const inserted = await repo.insertInvitation(
    id,
    organizationId,
    actor.userId,
    normalizedEmail,
    role,
  );
  if (!inserted)
    return {
      ok: false as const,
      reason:
        "The invitation could not be created. Check your permissions or try again in an hour.",
    };
  const link = new URL("/workspace-invitation", origin);
  link.searchParams.set("token", token);
  try {
    const response = await fetch("https://app.loops.so/api/v1/transactional", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.LOOPS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transactionalId: env.LOOPS_TRANSACTIONAL_WORKSPACE_INVITE_ID,
        email: normalizedEmail,
        addToAudience: false,
        dataVariables: {
          workspaceName: workspace.name,
          inviterName: actor.userEmail,
          role,
          invitationUrl: link.toString(),
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Delivery failed");
    await db
      .insert(workspaceAudit)
      .values(
        repo.auditRow(
          organizationId,
          actor.userId,
          "invitation_sent",
          id,
          role,
        ),
      );
    return { ok: true as const };
  } catch {
    await db
      .update(invitation)
      .set({ status: "revoked" })
      .where(and(eq(invitation.id, id), eq(invitation.status, "pending")));
    return {
      ok: false as const,
      reason: "The invitation could not be delivered. Try sending it again.",
    };
  }
}
export async function revokeInvitation(
  actor: Actor,
  organizationId: string,
  id: string,
) {
  requireClientWorkspaces();
  const own = await requireWorkspaceMembership(
    actor.userId,
    organizationId,
    "manage_people",
  );
  const invite = await repo.findInvitation(id);
  if (
    !invite ||
    invite.organizationId !== organizationId ||
    !canManageRole(own.role, invite.role ?? "")
  )
    throw new AppError("FORBIDDEN");
  await runBatch((tx) => [
    repo.lockWorkspace(tx, organizationId),
    tx
      .update(invitation)
      .set({ status: "revoked" })
      .where(
        and(
          eq(invitation.id, id),
          eq(invitation.status, "pending"),
          repo.actorCanManage(organizationId, actor.userId, invite.role ?? ""),
        ),
      ),
  ]);
}
export async function inspectInvitation(actor: Actor, token: string) {
  requireClientWorkspaces();
  if (!actor.emailVerified) return { state: "verify_email" as const };
  const invite = await repo.findInvitation(await tokenHash(token));
  if (!invite) return { state: "unavailable" as const };
  if (invite.email.toLowerCase() !== actor.userEmail.toLowerCase())
    return { state: "wrong_account" as const };
  if (invite.status !== "pending")
    return {
      state:
        invite.status === "accepted"
          ? ("accepted" as const)
          : ("unavailable" as const),
    };
  if (invite.expiresAt <= new Date()) return { state: "expired" as const };
  const workspace = await repo.getWorkspace(invite.organizationId);
  const [inviter] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.organizationId, invite.organizationId),
        eq(member.userId, invite.inviterId),
      ),
    );
  if (
    workspace?.status !== "active" ||
    !inviter ||
    !canManageRole(inviter.role, invite.role ?? "") ||
    invite.role === "owner"
  )
    return { state: "unavailable" as const };
  return {
    state: "pending" as const,
    workspace: { id: workspace.id, name: workspace.name },
    role: workspaceRoleSchema.parse(invite.role),
    invitationId: invite.id,
  };
}
export async function acceptInvitation(actor: Actor, token: string) {
  const details = await inspectInvitation(actor, token);
  if (details.state !== "pending") return details;
  const id = details.invitationId;
  const orgId = details.workspace.id;
  await runBatch((tx) => [
    repo.lockWorkspace(tx, orgId),
    tx
      .insert(member)
      .select(
        tx
          .select({
            id: sql<string>`${"invitation-" + id}`.as("id"),
            organizationId: invitation.organizationId,
            userId: sql<string>`${actor.userId}`.as("userId"),
            role: sql<string>`${invitation.role}`.as("role"),
            createdAt: repo.databaseNow().as("createdAt"),
          })
          .from(invitation)
          .where(
            and(
              eq(invitation.id, id),
              eq(invitation.status, "pending"),
              eq(invitation.email, actor.userEmail.toLowerCase()),
              sql`exists (select 1 from "user" where id = ${actor.userId} and lower(email) = ${invitation.email} and email_verified = true)`,
              sql`${invitation.expiresAt} > ${repo.databaseNow()}`,
              repo.actorCanManage(
                orgId,
                sql`${invitation.inviterId}`,
                details.role,
              ),
            ),
          ),
      )
      .onConflictDoNothing({ target: [member.organizationId, member.userId] }),
    tx
      .update(invitation)
      .set({ status: "accepted" })
      .where(
        and(
          eq(invitation.id, id),
          eq(invitation.status, "pending"),
          sql`exists (select 1 from member where member.id = ${"invitation-" + id} and member.user_id = ${actor.userId})`,
        ),
      ),
  ]);
  const membership = await requireWorkspaceMembership(actor.userId, orgId);
  if ((await repo.findInvitation(id))?.status !== "accepted")
    return { state: "unavailable" as const };
  return { state: "accepted" as const, workspaceId: membership.organizationId };
}

export async function resendInvitation(
  actor: Actor,
  organizationId: string,
  id: string,
) {
  requireClientWorkspaces();
  await requireWorkspaceMembership(
    actor.userId,
    organizationId,
    "manage_people",
  );
  const invite = await repo.findInvitation(id);
  if (
    !invite ||
    invite.organizationId !== organizationId ||
    invite.status !== "pending"
  )
    throw new AppError("NOT_FOUND");
  return sendInvitation(
    actor,
    organizationId,
    invite.email,
    workspaceRoleSchema.parse(invite.role),
  );
}
export async function transferWorkspaceOwnership(
  actor: Actor,
  organizationId: string,
  successorId: string,
) {
  requireClientWorkspaces();
  await requireWorkspaceMembership(actor.userId, organizationId, "own");
  await repo.transferOwnership(organizationId, actor.userId, successorId);
  const [after] = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.id, successorId),
        eq(member.organizationId, organizationId),
        eq(member.role, "owner"),
      ),
    );
  return after && after.userId !== actor.userId
    ? { ok: true as const }
    : {
        ok: false as const,
        reason:
          "Choose another current member. Your permissions may have changed.",
      };
}

// Which of the caller's workspaces holds a project, so a link into another
// workspace can offer a switch instead of a dead end. Answers only for
// workspaces the caller already belongs to, so it reveals nothing new.
export async function projectWorkspace(userId: string, projectId: string) {
  const project = await ProjectRepository.getProjectById(projectId);
  if (!project) return null;
  const memberships = await repo.listMemberships(userId);
  const workspace = memberships.find(
    (item) => item.id === project.organizationId,
  );
  return workspace ? { id: workspace.id, name: workspace.name } : null;
}
