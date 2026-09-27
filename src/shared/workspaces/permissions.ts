import { z } from "zod";

export const workspaceRoleSchema = z.enum([
  "owner",
  "admin",
  "editor",
  "viewer",
]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

// What a member may do in a workspace. Each capability names the lowest role
// that holds it; higher roles inherit everything below them.
//   read          view projects, reports, plans and analytics
//   edit          change project content (plans, actions, saved keywords)
//   run           start metered or AI work (research, audits, Sam, MCP),
//                 billed to the workspace's payer
//   configure     connect integrations, tracking and project settings
//   manage_people invite members and change their roles (see canManageRole)
//   own           workspace lifecycle, ownership transfer, merges
export const workspaceCapabilitySchema = z.enum([
  "read",
  "edit",
  "run",
  "configure",
  "manage_people",
  "own",
]);
export type WorkspaceCapability = z.infer<typeof workspaceCapabilitySchema>;

const level: Record<WorkspaceRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};
const required: Record<WorkspaceCapability, number> = {
  read: level.viewer,
  edit: level.editor,
  run: level.editor,
  configure: level.admin,
  manage_people: level.admin,
  own: level.owner,
};
export function canWorkspace(role: string, capability: WorkspaceCapability) {
  const parsed = workspaceRoleSchema.safeParse(role);
  return parsed.success && level[parsed.data] >= required[capability];
}
export function canManageRole(
  actor: string,
  target: string,
  requested?: string,
) {
  if (actor === "owner") return true;
  return (
    actor === "admin" &&
    ["editor", "viewer"].includes(target) &&
    (!requested || ["editor", "viewer"].includes(requested))
  );
}
