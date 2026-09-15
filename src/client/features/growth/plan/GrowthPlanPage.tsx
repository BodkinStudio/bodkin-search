import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  createGrowthWorkstream,
  deleteGrowthWorkstream,
  getGrowthPlan,
  getGrowthPlanEvidence,
  reorderGrowthWorkstreams,
} from "@/serverFunctions/growthPlan";
import type {
  GrowthPlanDto,
  GrowthPlanEvidenceDto,
  GrowthWorkstreamDto,
} from "@/types/schemas/growth-plan";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import { GrowthPlanBelief } from "./GrowthPlanBelief";
import { GrowthPlanHero } from "./GrowthPlanHero";
import { GrowthPlanLedger } from "./GrowthPlanLedger";
import {
  SECTION,
  SECTION_SUB,
  SECTION_TITLE,
  orderGrowthEvidence,
} from "./GrowthPlanPresentation";
import { GrowthPlanProgramme } from "./GrowthPlanProgramme";
import { GrowthPlanTiles } from "./GrowthPlanTiles";
import { GrowthPlanWorkstream } from "./GrowthPlanWorkstream";
import {
  GrowthWorkstreamForm,
  type GrowthWorkstreamDraft,
} from "./GrowthWorkstreamForm";
import { allocateGrowthPlanCharts } from "./growthPlanSeries";

const HERO_FALLBACK_EVIDENCE = 4;

export function GrowthPlanPage({
  projectId,
  defaultEdit = false,
}: {
  projectId: string;
  defaultEdit?: boolean;
}) {
  const client = useQueryClient();
  // The plan is a document first: everything that lets someone change it is
  // behind one switch, so the default read is as calm as the printed page.
  const [editing, setEditing] = useState(defaultEdit);
  const [adding, setAdding] = useState(false);
  const planKey = ["growthPlan", projectId];
  const query = useQuery({
    queryKey: planKey,
    queryFn: (): Promise<GrowthPlanDto> =>
      getGrowthPlan({ data: { projectId } }),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const refresh = () => client.invalidateQueries({ queryKey: planKey });
  // One request covers every workstream's live Search Console card.
  const evidenceQuery = useQuery({
    queryKey: ["growthPlanEvidence", projectId],
    queryFn: (): Promise<GrowthPlanEvidenceDto> =>
      getGrowthPlanEvidence({ data: { projectId } }),
    retry: false,
    staleTime: 15 * 60 * 1000,
  });
  // The project name is already in the cache from the project layout's access
  // check; the plan does not fetch it again just to write a breadcrumb.
  const projectName = z
    .object({ name: z.string() })
    .safeParse(client.getQueryData(["projectAccess", projectId])).data?.name;

  const add = useMutation({
    mutationKey: ["growthWorkstream", projectId],
    mutationFn: (draft: GrowthWorkstreamDraft) =>
      createGrowthWorkstream({
        data: {
          projectId,
          requestKey: crypto.randomUUID(),
          title: draft.title,
          commercialReason: draft.commercialReason,
          targetLabel: draft.targetLabel,
          targetBaseline: draft.targetBaseline,
          targetValue: draft.targetValue,
          targetDueOn: draft.targetDueOn,
        },
      }),
    retry: false,
    onSuccess: async () => {
      setAdding(false);
      await refresh();
    },
  });
  const reorder = useMutation({
    mutationKey: ["growthWorkstreamOrder", projectId],
    mutationFn: (orderedWorkstreamIds: string[]) =>
      reorderGrowthWorkstreams({ data: { projectId, orderedWorkstreamIds } }),
    retry: false,
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationKey: ["growthWorkstreamDelete", projectId],
    mutationFn: (workstreamId: string) =>
      deleteGrowthWorkstream({ data: { projectId, workstreamId } }),
    retry: false,
    onSuccess: refresh,
  });

  const workstreams = query.data?.workstreams ?? [];
  const actions = workstreams.flatMap((workstream) => workstream.actions);
  const evidence = actions.flatMap((action) => action.evidence);
  const charts = allocateGrowthPlanCharts(workstreams);
  const heroTarget =
    workstreams.find(
      (workstream) => workstream.status === "active" && workstream.targetLabel,
    ) ?? null;
  const move = (workstream: GrowthWorkstreamDto, direction: -1 | 1) => {
    const ids = workstreams.map((entry) => entry.id);
    const from = ids.indexOf(workstream.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder.mutate(ids);
  };
  const failure = add.error ?? reorder.error ?? remove.error;

  return (
    <div className="px-6 py-6 pb-24 md:pb-12">
      <div className="mx-auto max-w-[1120px]">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-base-300 pb-3">
          {projectName ? (
            <span className="text-sm font-medium">{projectName}</span>
          ) : null}
          <span className="text-sm text-base-content/70">Growth plan</span>
          {query.data?.updatedAt ? (
            <span className="text-xs tabular-nums text-base-content/60">
              Updated {formatGrowthPreviewDate(query.data.updatedAt)}
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-xs ml-auto"
            aria-pressed={editing}
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? "Done editing" : "Edit plan"}
          </button>
        </header>

        {query.isPending ? (
          <p role="status" aria-busy="true" className="mt-4 text-sm">
            Loading the plan…
          </p>
        ) : null}
        {query.isError ? (
          <p role="alert" className="mt-4 text-sm">
            The plan could not be loaded. Reload the page to try again.
          </p>
        ) : null}
        {failure ? (
          <p role="alert" className="mt-4 text-sm">
            {getStandardErrorMessage(failure, "That change was not saved.")}
          </p>
        ) : null}

        <div className="mt-8">
          <GrowthPlanHero
            projectId={projectId}
            thesis={query.data?.thesis}
            lede={query.data?.lede}
            target={heroTarget}
            series={charts.hero}
            fallbackEvidence={orderGrowthEvidence(
              workstreams[0]?.actions.flatMap((action) => action.evidence) ??
                [],
              HERO_FALLBACK_EVIDENCE,
            )}
            editing={editing}
          />
        </div>

        <div className="mt-8">
          <GrowthPlanTiles
            actions={actions}
            evidence={evidence}
            sparkline={charts.tile}
          />
        </div>

        <GrowthPlanBelief />

        {workstreams.length > 0 ? (
          <div
            className={`${SECTION} flex flex-wrap items-end justify-between gap-3`}
          >
            <h2 className={SECTION_TITLE}>
              {workstreams.length === 1
                ? "One workstream"
                : `${workstreams.length} workstreams, in priority order`}
            </h2>
            <p className={SECTION_SUB}>
              Each pairs the evidence with the work it justifies
            </p>
          </div>
        ) : null}

        {editing ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setAdding((current) => !current)}
            >
              Add workstream
            </button>
          </div>
        ) : null}
        {editing && adding ? (
          <GrowthWorkstreamForm
            pending={add.isPending}
            error={null}
            onSubmit={(draft) => add.mutate(draft)}
            onCancel={() => setAdding(false)}
          />
        ) : null}

        {workstreams.map((workstream, index) => (
          <GrowthPlanWorkstream
            key={workstream.id}
            projectId={projectId}
            projectName={projectName}
            workstream={workstream}
            workstreams={workstreams}
            canMoveUp={index > 0}
            canMoveDown={index < workstreams.length - 1}
            reordering={reorder.isPending}
            deleting={remove.isPending}
            evidence={evidenceQuery.data?.workstreams.find(
              (series) => series.workstreamId === workstream.id,
            )}
            evidencePending={evidenceQuery.isPending}
            evidenceFailed={evidenceQuery.isError}
            series={charts.byWorkstream.get(workstream.id) ?? null}
            editing={editing}
            onMove={(direction) => move(workstream, direction)}
            onDelete={() => remove.mutate(workstream.id)}
          />
        ))}

        {query.data && workstreams.length === 0 ? (
          <section className="mt-8 rounded-lg border border-base-300 bg-base-100 p-6">
            <p className="max-w-prose text-sm">
              No plan yet. Switch to Edit plan to add the first workstream, or
              write the plan from a chat session with the
              growth_create_workstream and growth_create_action MCP tools.
            </p>
          </section>
        ) : null}

        <GrowthPlanProgramme actions={actions} />

        <GrowthPlanLedger projectId={projectId} />

        <p className="mt-10 text-[12.5px] text-base-content/60">
          Action statuses and evidence are entered by the plan&rsquo;s authors;
          every figure carries its source above.
        </p>
      </div>
    </div>
  );
}
