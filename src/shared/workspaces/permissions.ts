import { z } from "zod";

export const workspaceRoleSchema = z.enum([
  "owner",
  "admin",
  "editor",
  "viewer",
]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export const workspaceCapabilitySchema = z.enum([
  "read",
  "edit",
  "admin",
  "owner",
]);
export type WorkspaceCapability = z.infer<typeof workspaceCapabilitySchema>;
const level: Record<WorkspaceRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};
const required: Record<WorkspaceCapability, number> = {
  read: 0,
  edit: 1,
  admin: 2,
  owner: 3,
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
