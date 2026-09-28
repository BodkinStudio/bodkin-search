import { requireWorkspaceMembership } from "./WorkspaceAccess";
import { getWorkspace } from "./WorkspaceRepository";
import { moveProject } from "./ProjectMoveRepository";
import { requireClientWorkspaces, type Actor } from "./WorkspaceService";

// Moves one of the owner's projects into another workspace they own. Both must
// be paid for by the same organization, since usage is billed to the payer.
export async function moveProjectToWorkspace(
  actor: Actor,
  projectId: string,
  fromOrganizationId: string,
  toOrganizationId: string,
) {
  requireClientWorkspaces();
  if (fromOrganizationId === toOrganizationId)
    return {
      ok: false as const,
      reason: "The project is already in that workspace.",
    };
  await requireWorkspaceMembership(actor.userId, fromOrganizationId, "own");
  await requireWorkspaceMembership(actor.userId, toOrganizationId, "own");
  const [from, to] = await Promise.all([
    getWorkspace(fromOrganizationId),
    getWorkspace(toOrganizationId),
  ]);
  if (!from || !to || from.payerOrganizationId !== to.payerOrganizationId)
    return {
      ok: false as const,
      reason:
        "Projects can only move between workspaces paid for by the same organization.",
    };
  const moved = await moveProject(
    actor.userId,
    projectId,
    fromOrganizationId,
    toOrganizationId,
  );
  return moved
    ? { ok: true as const }
    : {
        ok: false as const,
        reason: "The project was not moved. Your permissions may have changed.",
      };
}
