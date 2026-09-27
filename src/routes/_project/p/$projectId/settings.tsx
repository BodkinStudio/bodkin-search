import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { getProjects } from "@/serverFunctions/projects";
import { useWorkspaceAccess } from "@/client/features/workspaces/useWorkspaceAccess";

export const Route = createFileRoute("/_project/p/$projectId/settings")({
  component: ProjectSettingsLayout,
});

const tabs = [
  { to: "/p/$projectId/settings/analytics" as const, label: "Analytics" },
  { to: "/p/$projectId/settings" as const, label: "General", exact: true },
  { to: "/p/$projectId/settings/context" as const, label: "Context" },
  { to: "/p/$projectId/settings/integrations" as const, label: "Integrations" },
];

function ProjectSettingsLayout() {
  const { projectId } = Route.useParams();
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const project = projectsQuery.data?.find((entry) => entry.id === projectId);
  const canConfigure = useWorkspaceAccess().can("configure");

  return (
    <div className="h-full overflow-auto bg-base-100">
      <div className="mx-auto w-full max-w-2xl space-y-8 p-4 py-8 pb-24 sm:p-6 md:py-12 md:pb-12">
        <div className="space-y-4">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-sm text-base-content/60 transition-colors hover:text-base-content"
          >
            <ChevronLeft className="size-4" />
            Projects
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Project settings
            </h1>
            <p className="text-sm text-base-content/60">
              {project?.name ?? " "}
            </p>
          </div>
          {canConfigure ? null : (
            <p className="text-sm text-base-content/70" role="status">
              Project settings are managed by workspace admins. Ask an owner or
              admin if something here needs to change.
            </p>
          )}
          <div
            role="tablist"
            className={canConfigure ? "tabs tabs-border" : "hidden"}
          >
            {tabs.map((tab) => (
              <Link
                key={tab.to}
                role="tab"
                to={tab.to}
                params={{ projectId }}
                activeOptions={{ exact: tab.exact ?? false }}
                className="tab"
                activeProps={{
                  className: "tab-active",
                  "aria-selected": true,
                }}
                inactiveProps={{ "aria-selected": false }}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        {canConfigure ? <Outlet /> : null}
      </div>
    </div>
  );
}
