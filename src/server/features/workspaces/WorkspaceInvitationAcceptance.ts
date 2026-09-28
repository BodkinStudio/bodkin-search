import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invitation, member } from "@/db/schema";
import { runBatch } from "@/db/runBatch";
import {
  canManageRole,
  workspaceRoleSchema,
} from "@/shared/workspaces/permissions";
import { requireWorkspaceMembership } from "./WorkspaceAccess";
import * as repo from "./WorkspaceRepository";
import {
  requireClientWorkspaces,
  tokenHash,
  type Actor,
} from "./WorkspaceService";

// Joining a workspace from an invitation: by the emailed link's token, or,
// for someone who signed up without opening it, by the invitations waiting
// for their verified address.
export async function inspectInvitation(actor: Actor, token: string) {
  return inspectInvitationById(actor, await tokenHash(token));
}

async function inspectInvitationById(actor: Actor, id: string) {
  requireClientWorkspaces();
  if (!actor.emailVerified) return { state: "verify_email" as const };
  const invite = await repo.findInvitation(id);
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
// Invitations waiting for the signed-in person's verified email, so someone
// who signed up without opening the emailed link can still join.
export async function listMyInvitations(actor: Actor) {
  requireClientWorkspaces();
  if (!actor.emailVerified) return [];
  const ids = await repo.listPendingInvitationIds(actor.userEmail);
  const details = await Promise.all(
    ids.map((id) => inspectInvitationById(actor, id)),
  );
  return details.flatMap((entry) =>
    entry.state === "pending"
      ? [
          {
            invitationId: entry.invitationId,
            workspace: entry.workspace,
            role: entry.role,
          },
        ]
      : [],
  );
}

export async function acceptInvitation(actor: Actor, token: string) {
  return acceptInvitationById(actor, await tokenHash(token));
}

// The accepting write re-checks the invited email, verification, expiry and
// the inviter's rights, so an invitation id is as safe to accept as a token.
export async function acceptInvitationById(actor: Actor, invitationId: string) {
  const details = await inspectInvitationById(actor, invitationId);
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
