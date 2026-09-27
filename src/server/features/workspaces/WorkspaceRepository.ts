import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  invitation,
  member,
  organization,
  user,
  workspaceAudit,
  workspaceConfiguration,
} from "@/db/schema";
import { getDatabaseProvider } from "@/db/provider";
import { runBatch } from "@/db/runBatch";
import type { WorkspaceRole } from "@/shared/workspaces/permissions";

export const databaseNow = () =>
  getDatabaseProvider() === "postgres"
    ? sql<Date>`CURRENT_TIMESTAMP`
    : sql<Date>`(cast(unixepoch('subsecond') * 1000 as integer))`;

export async function listMemberships(userId: string) {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      role: member.role,
      payerOrganizationId: workspaceConfiguration.payerOrganizationId,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .innerJoin(
      workspaceConfiguration,
      eq(workspaceConfiguration.organizationId, organization.id),
    )
    .where(
      and(
        eq(member.userId, userId),
        eq(workspaceConfiguration.status, "active"),
      ),
    )
    .orderBy(asc(member.createdAt), asc(member.id));
}
export async function getWorkspace(organizationId: string) {
  const [row] = await db
    .select({
      id: organization.id,
      name: organization.name,
      payerOrganizationId: workspaceConfiguration.payerOrganizationId,
      status: workspaceConfiguration.status,
    })
    .from(organization)
    .innerJoin(
      workspaceConfiguration,
      eq(workspaceConfiguration.organizationId, organization.id),
    )
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row;
}
export async function listPeople(organizationId: string) {
  const [members, invitations, audit] = await Promise.all([
    db
      .select({
        id: member.id,
        userId: member.userId,
        name: user.name,
        email: user.email,
        role: member.role,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, organizationId))
      .orderBy(asc(user.name)),
    db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      })
      .from(invitation)
      .where(eq(invitation.organizationId, organizationId))
      .orderBy(desc(invitation.createdAt))
      .limit(100),
    db
      .select({
        id: workspaceAudit.id,
        action: workspaceAudit.action,
        targetId: workspaceAudit.targetId,
        role: workspaceAudit.role,
        createdAt: workspaceAudit.createdAt,
      })
      .from(workspaceAudit)
      .where(eq(workspaceAudit.organizationId, organizationId))
      .orderBy(desc(workspaceAudit.createdAt))
      .limit(50),
  ]);
  return { members, invitations, audit };
}
export async function findInvitation(id: string) {
  const [row] = await db
    .select()
    .from(invitation)
    .where(eq(invitation.id, id))
    .limit(1);
  return row;
}
export function auditRow(
  organizationId: string,
  actorId: string,
  action: string,
  targetId: string,
  role?: string,
) {
  return {
    id: crypto.randomUUID(),
    organizationId,
    actorId,
    action,
    targetId,
    role: role ?? null,
    createdAt: new Date().toISOString(),
  };
}
// Serialize membership/invitation writes per workspace on Postgres; D1 batches
// already serialize writers. All predicates below still recheck live authority.
export function lockWorkspace(
  tx: Parameters<Parameters<typeof runBatch>[0]>[0],
  id: string,
) {
  return tx
    .update(organization)
    .set({ name: sql`${organization.name}` })
    .where(eq(organization.id, id));
}
export function actorCanManage(
  organizationId: string,
  actorId: string | SQL,
  role: string | SQL,
) {
  return sql`exists (select 1 from workspace_configuration as configuration where configuration.organization_id = ${organizationId} and configuration.status = 'active') and exists (select 1 from member as actor where actor.organization_id = ${organizationId} and actor.user_id = ${actorId} and (actor.role = 'owner' or (actor.role = 'admin' and ${role} in ('editor', 'viewer'))))`;
}
export async function createWorkspaceRecord(
  actorId: string,
  sourceOrganizationId: string,
  name: string,
  payerOrganizationId: string,
) {
  const id = crypto.randomUUID();
  await runBatch((tx) => [
    lockWorkspace(tx, sourceOrganizationId),
    tx.insert(organization).select(
      tx
        .select({
          id: sql<string>`${id}`.as("id"),
          name: sql<string>`${name}`.as("name"),
          slug: sql<string>`${id}`.as("slug"),
          logo: sql<string>`null`.as("logo"),
          createdAt: databaseNow().as("createdAt"),
          metadata: sql<string>`null`.as("metadata"),
        })
        .from(member)
        .where(
          and(
            eq(member.organizationId, sourceOrganizationId),
            eq(member.userId, actorId),
            eq(member.role, "owner"),
            actorCanManage(sourceOrganizationId, actorId, "owner"),
            sql`exists (select 1 from workspace_configuration where organization_id = ${sourceOrganizationId} and payer_organization_id = ${payerOrganizationId})`,
          ),
        ),
    ),
    tx.insert(workspaceConfiguration).select(
      tx
        .select({
          organizationId: organization.id,
          payerOrganizationId: sql<string>`${payerOrganizationId}`.as(
            "payerOrganizationId",
          ),
          status: sql<string>`'active'`.as("status"),
        })
        .from(organization)
        .where(eq(organization.id, id)),
    ),
    tx.insert(member).select(
      tx
        .select({
          id: sql<string>`${crypto.randomUUID()}`.as("id"),
          organizationId: organization.id,
          userId: sql<string>`${actorId}`.as("userId"),
          role: sql<string>`'owner'`.as("role"),
          createdAt: databaseNow().as("createdAt"),
        })
        .from(organization)
        .where(eq(organization.id, id)),
    ),
  ]);
  return id;
}
export async function updateMemberRole(
  organizationId: string,
  actorId: string,
  targetId: string,
  role: WorkspaceRole | null,
) {
  const target = and(
    eq(member.id, targetId),
    eq(member.organizationId, organizationId),
    actorCanManage(organizationId, actorId, role ?? "viewer"),
    sql`exists (select 1 from member as actor where actor.organization_id = ${organizationId} and actor.user_id = ${actorId} and (actor.role = 'owner' or ${member.role} in ('editor','viewer')))`,
    sql`(${role} = 'owner' or ${member.role} <> 'owner' or (select count(*) from member as owners where owners.organization_id = ${organizationId} and owners.role = 'owner') > 1)`,
  );
  await runBatch((tx) => [
    lockWorkspace(tx, organizationId),
    // Audit only eligible changes, before the target is removed or demoted.
    tx.insert(workspaceAudit).select(
      tx
        .select({
          id: sql<string>`${crypto.randomUUID()}`.as("id"),
          organizationId: member.organizationId,
          actorId: sql<string>`${actorId}`.as("actorId"),
          action:
            sql<string>`${role ? "member_role_changed" : "member_removed"}`.as(
              "action",
            ),
          targetId: member.id,
          role: sql<string | null>`${role}`.as("role"),
          createdAt: sql<string>`${new Date().toISOString()}`.as("createdAt"),
        })
        .from(member)
        .where(target),
    ),
    role
      ? tx.update(member).set({ role }).where(target)
      : tx.delete(member).where(target),
    tx
      .update(invitation)
      .set({ status: "revoked" })
      .where(
        and(
          eq(invitation.organizationId, organizationId),
          eq(invitation.status, "pending"),
          sql`not exists (select 1 from member as inviter where inviter.user_id = ${invitation.inviterId} and inviter.organization_id = ${organizationId} and (inviter.role = 'owner' or (inviter.role = 'admin' and ${invitation.role} in ('editor','viewer'))))`,
        ),
      ),
  ]);
}

const invitationExpiry = () =>
  getDatabaseProvider() === "postgres"
    ? sql<Date>`(CURRENT_TIMESTAMP + interval '7 days')`
    : sql<Date>`(cast(unixepoch('subsecond') * 1000 as integer) + 604800000)`;

export async function insertInvitation(
  id: string,
  organizationId: string,
  actorId: string,
  email: string,
  role: WorkspaceRole,
) {
  const recent =
    getDatabaseProvider() === "postgres"
      ? sql`CURRENT_TIMESTAMP - interval '1 hour'`
      : sql`cast(unixepoch('subsecond') * 1000 as integer) - 3600000`;
  const allowed = and(
    actorCanManage(organizationId, actorId, role),
    sql`(select count(*) from invitation where organization_id = ${organizationId} and created_at > ${recent}) < 30`,
    sql`(select count(*) from invitation where inviter_id = ${actorId} and created_at > ${recent}) < 20`,
    sql`(select count(*) from invitation where organization_id = ${organizationId} and email = ${email} and created_at > ${recent}) < 3`,
  );
  await runBatch((tx) => [
    // Serialize actor-wide limits across workspaces, always before the workspace lock.
    tx
      .update(user)
      .set({ name: sql`${user.name}` })
      .where(eq(user.id, actorId)),
    lockWorkspace(tx, organizationId),
    tx
      .update(invitation)
      .set({ status: "revoked" })
      .where(
        and(
          eq(invitation.organizationId, organizationId),
          eq(invitation.email, email),
          eq(invitation.status, "pending"),
          allowed,
        ),
      ),
    tx.insert(invitation).select(
      tx
        .select({
          id: sql<string>`${id}`.as("id"),
          organizationId: member.organizationId,
          email: sql<string>`${email}`.as("email"),
          role: sql<string>`${role}`.as("role"),
          status: sql<string>`'pending'`.as("status"),
          expiresAt: invitationExpiry().as("expiresAt"),
          createdAt: databaseNow().as("createdAt"),
          inviterId: member.userId,
        })
        .from(member)
        .where(
          and(
            eq(member.organizationId, organizationId),
            eq(member.userId, actorId),
            allowed,
            sql`(select count(*) from invitation where organization_id = ${organizationId} and status = 'pending') < 100`,
          ),
        ),
    ),
  ]);
  return findInvitation(id);
}

export async function transferOwnership(
  organizationId: string,
  actorId: string,
  successorId: string,
) {
  await runBatch((tx) => [
    lockWorkspace(tx, organizationId),
    tx
      .update(member)
      .set({ role: "owner" })
      .where(
        and(
          eq(member.id, successorId),
          eq(member.organizationId, organizationId),
          sql`${member.userId} <> ${actorId}`,
          actorCanManage(organizationId, actorId, "owner"),
        ),
      ),
    tx.insert(workspaceAudit).select(
      tx
        .select({
          id: sql<string>`${crypto.randomUUID()}`.as("id"),
          organizationId: member.organizationId,
          actorId: sql<string>`${actorId}`.as("actorId"),
          action: sql<string>`'ownership_transferred'`.as("action"),
          targetId: member.id,
          role: sql<string>`'owner'`.as("role"),
          createdAt: sql<string>`${new Date().toISOString()}`.as("createdAt"),
        })
        .from(member)
        .where(
          and(
            eq(member.id, successorId),
            eq(member.organizationId, organizationId),
            eq(member.role, "owner"),
            sql`${member.userId} <> ${actorId}`,
            actorCanManage(organizationId, actorId, "owner"),
          ),
        ),
    ),
    tx
      .update(member)
      .set({ role: "admin" })
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, actorId),
          eq(member.role, "owner"),
          sql`exists (select 1 from member as successor where successor.id = ${successorId} and successor.organization_id = ${organizationId} and successor.user_id <> ${actorId} and successor.role = 'owner')`,
          actorCanManage(organizationId, actorId, "owner"),
        ),
      ),
  ]);
}
