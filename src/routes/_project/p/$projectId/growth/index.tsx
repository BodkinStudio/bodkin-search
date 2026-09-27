import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { workspaceSessionOptions } from "@/client/features/workspaces/WorkspaceSwitcher";
import { canWorkspace } from "@/shared/workspaces/permissions";
import { z } from "zod";
import { GrowthPlanPage } from "@/client/features/growth/plan/GrowthPlanPage";

// ?edit=1 opens the plan with its editing controls, so a link can hand someone
// the page ready to change rather than ready to read. The router's default
// parser hands back a number for "1", so the value is coerced and a junk value
// is dropped rather than failing the whole route.
const growthPlanSearchSchema = z.object({
  edit: z.coerce.string().optional().catch(undefined),
});

const EDIT_VALUES = new Set(["1", "true"]);

export const Route = createFileRoute("/_project/p/$projectId/growth/")({
  validateSearch: growthPlanSearchSchema,
  component: GrowthPlanRoute,
});

export function GrowthPlanRoute() {
  const { projectId } = Route.useParams();
  const { edit } = Route.useSearch();
  const session = useQuery(workspaceSessionOptions());
  const activeRole = session.data?.memberships.find(
    (membership) => membership.id === session.data?.organizationId,
  )?.role;
  const canEdit =
    session.isSuccess &&
    (!session.data.enabled || canWorkspace(activeRole ?? "", "edit"));
  return (
    <GrowthPlanPage
      key={projectId}
      projectId={projectId}
      canEdit={canEdit}
      defaultEdit={edit !== undefined && EDIT_VALUES.has(edit.toLowerCase())}
    />
  );
}
