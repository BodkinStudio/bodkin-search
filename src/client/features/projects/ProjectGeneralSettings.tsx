import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspaceAccess } from "@/client/features/workspaces/useWorkspaceAccess";
import { switchWorkspace } from "@/client/features/workspaces/WorkspaceSwitcher";
import { moveProjectToWorkspace } from "@/serverFunctions/clientWorkspaces";
import { ProjectMarketFields } from "@/client/features/projects/ProjectMarketFields";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  clearLastProjectId,
  getLastProjectId,
} from "@/client/lib/active-project";
import {
  archiveProject,
  getProjects,
  updateProject,
} from "@/serverFunctions/projects";
import type { ProjectSummary } from "./types";

export function ProjectGeneralSettings({ projectId }: { projectId: string }) {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const projects = projectsQuery.data ?? [];
  const project = projects.find((entry) => entry.id === projectId) ?? null;

  if (!project) {
    return (
      <div className="flex justify-center py-10">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* key resets the form's local state when switching between projects */}
      <GeneralSection key={project.id} project={project} />
      <MoveProjectSection project={project} />
      <DangerSection project={project} canArchive={projects.length > 1} />
    </div>
  );
}

function GeneralSection({ project }: { project: ProjectSummary }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState(project.name);
  const [domain, setDomain] = React.useState(project.domain ?? "");
  const [market, setMarket] = React.useState({
    locationCode: project.locationCode,
    languageCode: project.languageCode,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateProject({
        data: {
          projectId: project.id,
          name: name.trim(),
          domain: domain.trim() || undefined,
          ...market,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project updated");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to update project")),
  });

  const isDirty =
    name.trim() !== project.name ||
    (domain.trim() || "") !== (project.domain ?? "") ||
    market.locationCode !== project.locationCode ||
    market.languageCode !== project.languageCode;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (updateMutation.isPending) return;
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    updateMutation.mutate();
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-base-content/50">General</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            className="input input-bordered w-full"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">
            Domain <span className="text-base-content/50">(optional)</span>
          </span>
          <input
            type="text"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com"
            maxLength={255}
            className="input input-bordered w-full"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <ProjectMarketFields value={market} onChange={setMarket} />
          <span className="text-xs text-base-content/50">
            Keyword, SERP, and domain data uses this country and language unless
            a call asks for a different one.
          </span>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={updateMutation.isPending || !isDirty}
          >
            Save changes
          </button>
        </div>
      </form>
    </section>
  );
}

function DangerSection({
  project,
  canArchive,
}: {
  project: ProjectSummary;
  canArchive: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = React.useState(false);

  const archiveMutation = useMutation({
    mutationFn: () => archiveProject({ data: { projectId: project.id } }),
    onSuccess: async () => {
      if (getLastProjectId() === project.id) clearLastProjectId();
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project archived");
      // Re-resolve to a remaining project via the landing redirect.
      void navigate({ to: "/" });
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to archive project")),
  });

  return (
    <section className="space-y-3 border-t border-base-300 pt-8">
      <h2 className="text-sm font-medium text-base-content/50">
        Archive project
      </h2>

      {confirming ? (
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">
            Archiving{" "}
            <span className="font-medium text-base-content">
              {project.name}
            </span>{" "}
            removes it from your workspace and stops its scheduled rank
            tracking. You can restore it later from the Projects page.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-error btn-sm"
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
            >
              Yes, archive project
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirming(false)}
              disabled={archiveMutation.isPending}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-base-content/60">
            {canArchive
              ? "Archive this project to remove it from your workspace."
              : "You can't archive your only project."}
          </p>
          <button
            type="button"
            className="btn btn-outline btn-error btn-sm shrink-0"
            onClick={() => setConfirming(true)}
            disabled={!canArchive}
          >
            Archive project
          </button>
        </div>
      )}
    </section>
  );
}

// Owners can move a project into another workspace they own that is paid for
// by the same organization (for example, from the agency workspace into a new
// client workspace). Hidden when there is nowhere to move it.
function MoveProjectSection({ project }: { project: ProjectSummary }) {
  const cache = useQueryClient();
  const access = useWorkspaceAccess();
  const current = access.workspace;
  const targets =
    access.session.data?.memberships.filter(
      (workspace) =>
        workspace.role === "owner" &&
        workspace.id !== current?.id &&
        workspace.payerOrganizationId === current?.payerOrganizationId,
    ) ?? [];
  const [target, setTarget] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const move = useMutation({
    mutationFn: (organizationId: string) =>
      moveProjectToWorkspace({
        data: { projectId: project.id, organizationId },
      }),
    onSuccess: async (result, organizationId) => {
      if (!result.ok) {
        toast.error(result.reason);
        setConfirming(false);
        return;
      }
      toast.success("Project moved.");
      await switchWorkspace(cache, organizationId, `/p/${project.id}`);
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "The project was not moved.")),
  });
  if (!access.clientWorkspaces || !access.can("own") || targets.length === 0)
    return null;
  const targetName = targets.find((workspace) => workspace.id === target)?.name;

  return (
    <section className="space-y-3 border-t border-base-300 pt-8">
      <h2 className="text-sm font-medium text-base-content/50">
        Move to another workspace
      </h2>
      <p className="text-sm text-base-content/60">
        Moves the project, its data and its connected integrations. People in
        the other workspace will see it; people who are only in this one will
        not.
      </p>
      {confirming && targetName ? (
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">
            Move <span className="font-medium">{project.name}</span> to{" "}
            <span className="font-medium">{targetName}</span>?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={move.isPending}
              onClick={() => move.mutate(target)}
            >
              Yes, move project
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={move.isPending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="move-project-target">
            Workspace
          </label>
          <select
            id="move-project-target"
            className="select select-sm w-auto"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">Choose a workspace</option>
            {targets.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={!target}
            onClick={() => setConfirming(true)}
          >
            Move project
          </button>
        </div>
      )}
    </section>
  );
}
