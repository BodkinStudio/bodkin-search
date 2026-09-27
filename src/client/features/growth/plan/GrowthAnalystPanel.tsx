import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  addGrowthFindingToPlan,
  dismissGrowthFinding,
  getGrowthAnalystDigest,
} from "@/serverFunctions/growthPlan";
import type { GrowthWorkstreamDto } from "@/types/schemas/growth-plan";
import { GrowthInvestigationReview } from "../GrowthInvestigation";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import { CARD, EYEBROW } from "./GrowthPlanPresentation";

type Digest = Awaited<ReturnType<typeof getGrowthAnalystDigest>>;
type Finding = Digest["findings"][number];

const DISMISS_REASONS = [
  { value: "irrelevant", label: "Not relevant to us" },
  { value: "too_much_effort", label: "Not worth the effort" },
  { value: "wrong_diagnosis", label: "The numbers are misleading" },
] as const;

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// The analyst's weekly read: what the automatic checks found, each with a
// plain next step, and which shipped work is being measured.
export function GrowthAnalystPanel({
  projectId,
  workstreams,
  canEdit,
}: {
  projectId: string;
  workstreams: GrowthWorkstreamDto[];
  canEdit: boolean;
}) {
  const client = useQueryClient();
  const digestKey = ["growthAnalystDigest", projectId];
  const query = useQuery({
    queryKey: digestKey,
    queryFn: () => getGrowthAnalystDigest({ data: { projectId } }),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const [adding, setAdding] = useState<Finding | null>(null);
  const [reviewing, setReviewing] = useState<Finding | null>(null);
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: digestKey }),
      client.invalidateQueries({ queryKey: ["growthPlan", projectId] }),
      client.invalidateQueries({
        queryKey: ["growthPriorityRecommendations", projectId],
      }),
    ]);
  const dismiss = useMutation({
    mutationFn: (input: {
      signalId: string;
      dismissalReason: (typeof DISMISS_REASONS)[number]["value"];
    }) => dismissGrowthFinding({ data: { projectId, ...input } }),
    retry: false,
    onSuccess: refresh,
  });

  if (query.isPending)
    return <div className={`${CARD} skeleton h-40`} aria-busy="true" />;
  if (query.isError || !query.data) return null;
  const digest = query.data;

  return (
    <section
      aria-labelledby="growth-this-week"
      className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
    >
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="growth-this-week" className={EYEBROW}>
            This week
          </h2>
          <p className="text-xs text-base-content/60">
            {digest.lastWatchAt
              ? `Checked ${formatGrowthPreviewDate(digest.lastWatchAt)}`
              : "The first weekly check runs within the hour"}
          </p>
        </div>
        {dismiss.error ? (
          <p role="alert" className="mt-3 text-sm text-error">
            {getStandardErrorMessage(dismiss.error, "That was not saved.")}
          </p>
        ) : null}
        {digest.findings.length === 0 ? (
          <p className="mt-3 text-sm text-base-content/70">
            Nothing needs your attention. Bodkin checks your search data and key
            pages every week and will list anything worth acting on here.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-base-300">
            {digest.findings.map((finding) => (
              <li key={finding.signalId} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium">{finding.headline}</p>
                <p className="mt-1 text-sm text-base-content/70">
                  {finding.suggestion}
                </p>
                <p className="mt-1 text-xs text-base-content/50">
                  {finding.sourceLabel} · to{" "}
                  {formatGrowthPreviewDate(finding.observedOn)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {canEdit && workstreams.length > 0 ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => setAdding(finding)}
                    >
                      Add to plan
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => setReviewing(finding)}
                  >
                    Look into it
                  </button>
                  {canEdit ? (
                    <select
                      aria-label={`Dismiss: ${finding.title}`}
                      className="select select-ghost select-xs w-auto"
                      value=""
                      disabled={dismiss.isPending}
                      onChange={(event) => {
                        const reason = DISMISS_REASONS.find(
                          ({ value }) => value === event.target.value,
                        );
                        if (reason)
                          dismiss.mutate({
                            signalId: finding.signalId,
                            dismissalReason: reason.value,
                          });
                      }}
                    >
                      <option value="" disabled>
                        Dismiss…
                      </option>
                      {DISMISS_REASONS.map((reason) => (
                        <option key={reason.value} value={reason.value}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
        {digest.findingsTotal > digest.findings.length ? (
          <Link
            to="/p/$projectId/growth/$section"
            params={{ projectId, section: "priorities" }}
            className="link mt-3 inline-block text-sm"
          >
            See all {digest.findingsTotal} findings
          </Link>
        ) : null}
      </div>
      <GrowthMeasuring measuring={digest.measuring} />
      {adding ? (
        <AddFindingModal
          projectId={projectId}
          finding={adding}
          workstreams={workstreams}
          onClose={() => setAdding(null)}
          onAdded={async () => {
            setAdding(null);
            await refresh();
          }}
        />
      ) : null}
      {reviewing ? (
        <Modal
          maxWidth="max-w-3xl"
          labelledBy="growth-finding-review"
          onClose={() => {
            setReviewing(null);
            void refresh();
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="growth-finding-review" className="text-lg font-semibold">
              {reviewing.title}
            </h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setReviewing(null);
                void refresh();
              }}
            >
              Close
            </button>
          </div>
          <GrowthInvestigationReview
            projectId={projectId}
            signalId={reviewing.signalId}
          />
        </Modal>
      ) : null}
    </section>
  );
}

function GrowthMeasuring({ measuring }: { measuring: Digest["measuring"] }) {
  return (
    <div className={`${CARD} p-5`}>
      <h2 className={EYEBROW}>Being measured</h2>
      {measuring.length === 0 ? (
        <p className="mt-3 text-sm text-base-content/70">
          When you mark plan work as shipped, Bodkin starts measuring its effect
          and shows the result here.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {measuring.map((plan) => (
            <li key={plan.actionId}>
              <p className="text-sm font-medium">{plan.title}</p>
              <p className="text-xs text-base-content/60">
                Shipped {formatGrowthPreviewDate(plan.shippedOn)} · results from{" "}
                {formatGrowthPreviewDate(plan.resultsFrom)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddFindingModal({
  projectId,
  finding,
  workstreams,
  onClose,
  onAdded,
}: {
  projectId: string;
  finding: Finding;
  workstreams: GrowthWorkstreamDto[];
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [workstreamId, setWorkstreamId] = useState(workstreams[0]?.id ?? "");
  const [dueOn, setDueOn] = useState(inDays(30));
  const add = useMutation({
    mutationFn: () =>
      addGrowthFindingToPlan({
        data: { projectId, signalId: finding.signalId, workstreamId, dueOn },
      }),
    retry: false,
    onSuccess: onAdded,
  });
  return (
    <Modal
      maxWidth="max-w-md"
      labelledBy="growth-add-finding"
      onClose={onClose}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate();
        }}
      >
        <div>
          <h2 id="growth-add-finding" className="text-lg font-semibold">
            {finding.title}
          </h2>
          <p className="mt-1 text-sm text-base-content/70">
            {finding.suggestion} The numbers go with it as evidence.
          </p>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Workstream</span>
          <select
            className="select w-full"
            value={workstreamId}
            onChange={(event) => setWorkstreamId(event.target.value)}
          >
            {workstreams.map((workstream) => (
              <option key={workstream.id} value={workstream.id}>
                {workstream.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Due</span>
          <input
            type="date"
            className="input w-full"
            value={dueOn}
            required
            onChange={(event) => setDueOn(event.target.value)}
          />
        </label>
        {add.error ? (
          <p role="alert" className="text-sm text-error">
            {getStandardErrorMessage(add.error, "It was not added.")}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={add.isPending || !workstreamId}
          >
            {add.isPending ? "Adding…" : "Add to plan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
