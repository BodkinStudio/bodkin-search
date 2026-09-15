import { useQuery } from "@tanstack/react-query";
import { getGrowthOpportunities } from "@/serverFunctions/growthOpportunities";
import type { GrowthOpportunitiesPageDto } from "@/types/schemas/growth-opportunities";
import { GrowthInvestigation } from "./GrowthInvestigation";

function statusLabel(status: "proposed" | "snoozed" | "accepted") {
  if (status === "proposed") return "Ready for review";
  if (status === "snoozed") return "Snoozed";
  return "Accepted — needs action";
}

export function GrowthOpportunities({ projectId }: { projectId: string }) {
  const queryKey = ["growthPriorityRecommendations", projectId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => getGrowthOpportunities({ data: { projectId } }),
    retry: false,
  });

  return (
    <section
      id="growth-opportunities"
      aria-labelledby="growth-opportunities-title"
      className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="growth-opportunities-title" className="text-lg font-semibold">
            Opportunities
          </h2>
          <p className="mt-1 max-w-prose text-sm text-base-content/70">
            Saved rule-based suggestions from completed checks. They are not new
            discoveries or proof that a change will improve performance.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Refreshing…" : "Refresh saved opportunities"}
        </button>
      </div>
      {query.isPending ? <GrowthOpportunitiesState state="loading" /> : null}
      {query.isError ? (
        <GrowthOpportunitiesState
          state="error"
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data ? (
        <GrowthOpportunitiesList projectId={projectId} data={query.data} />
      ) : null}
    </section>
  );
}

export function GrowthOpportunitiesState({
  state,
  onRetry,
}: {
  state: "loading" | "error";
  onRetry?: () => void;
}) {
  if (state === "loading") {
    return (
      <p role="status" aria-busy="true" className="mt-4 text-sm">
        Loading saved opportunities…
      </p>
    );
  }
  return (
    <div role="alert" className="alert alert-error mt-4 flex-wrap">
      <p className="flex-1">Saved opportunities could not be loaded.</p>
      <button type="button" className="btn btn-sm" onClick={onRetry}>
        Retry saved opportunities
      </button>
    </div>
  );
}

export function GrowthOpportunitiesList({
  projectId,
  data,
}: {
  projectId: string;
  data: GrowthOpportunitiesPageDto;
}) {
  if (data.recommendations.length === 0) {
    return (
      <p role="status" className="mt-4 text-sm text-base-content/70">
        No unresolved saved opportunities are available for this project yet.{" "}
        <a className="link" href="#growth-live-check-title">
          Run a Growth check below
        </a>{" "}
        to save rule-based suggestions when a decline or ranking opportunity is
        detected.
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      {data.recommendations.map(({ recommendation, reviewSource }) => (
        <details
          key={recommendation.id}
          className="rounded-lg border border-base-300 px-4 py-3"
        >
          <summary className="cursor-pointer">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{recommendation.title}</span>
              <span className="text-sm text-base-content/70">
                {statusLabel(recommendation.status)}
              </span>
            </span>
          </summary>
          <div className="mt-3 space-y-3 text-sm [overflow-wrap:anywhere]">
            <p>{recommendation.rationale}</p>
            <ProjectionNotice recommendation={recommendation} />
            <p className="text-base-content/70">
              Review business fit, expected benefit and effort before approving
              work.
            </p>
            <OpportunityTargets recommendation={recommendation} />
            <OpportunitySteps recommendation={recommendation} />
            {recommendation.status === "accepted" ? (
              <p role="status" className="text-base-content/70">
                This older approval has no saved Action. It remains read-only
                here; ask a project administrator to review it before creating
                work.
              </p>
            ) : reviewSource ? (
              <GrowthInvestigation
                projectId={projectId}
                signalId={reviewSource.signalId}
              />
            ) : (
              <p className="text-base-content/70">
                Review controls are unavailable for this older or differently
                generated saved recommendation. Its saved details remain
                available here.
              </p>
            )}
          </div>
        </details>
      ))}
      {data.hasMore ? (
        <p role="status" className="text-sm text-base-content/70">
          More saved opportunities are available.
        </p>
      ) : null}
    </div>
  );
}

function ProjectionNotice({
  recommendation,
}: {
  recommendation: GrowthOpportunitiesPageDto["recommendations"][number]["recommendation"];
}) {
  const notices = [
    recommendation.titleRedacted ? "Title redacted." : null,
    recommendation.titleTruncated ? "Title truncated." : null,
    recommendation.rationaleRedacted ? "Rationale redacted." : null,
    recommendation.rationaleTruncated ? "Rationale truncated." : null,
    recommendation.categoryRedacted ? "Category redacted." : null,
    recommendation.categoryTruncated ? "Category truncated." : null,
  ].filter(Boolean);
  return notices.length ? (
    <p className="text-xs text-base-content/70">{notices.join(" ")}</p>
  ) : null;
}

function OpportunityTargets({
  recommendation,
}: {
  recommendation: GrowthOpportunitiesPageDto["recommendations"][number]["recommendation"];
}) {
  if (recommendation.displayTargets.length === 0) return null;
  return (
    <div>
      <h3 className="font-medium">Affected targets</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-base-content/70">
        {recommendation.displayTargets.map((target, index) => (
          <li key={`${target.type}:${index}`}>
            {target.type === "url" ? (
              <>
                {target.withheld
                  ? "Saved page URL withheld"
                  : (target.value ?? "Saved page URL withheld")}
                {target.queryOrFragmentOmitted
                  ? " (query or fragment omitted)"
                  : ""}
              </>
            ) : (
              <>
                {target.value}
                {target.redacted ? " (redacted)" : ""}
                {target.truncated ? " (truncated)" : ""}
              </>
            )}
          </li>
        ))}
      </ul>
      {recommendation.displayTargetsOmitted ||
      recommendation.displayTargetsWithheld ? (
        <p className="mt-1 text-xs text-base-content/70">
          Some saved targets are omitted or withheld from this summary.
        </p>
      ) : null}
    </div>
  );
}

function OpportunitySteps({
  recommendation,
}: {
  recommendation: GrowthOpportunitiesPageDto["recommendations"][number]["recommendation"];
}) {
  if (recommendation.displaySteps.length === 0) return null;
  return (
    <div>
      <h3 className="font-medium">Suggested next steps</h3>
      <ol className="mt-1 list-decimal space-y-1 pl-5">
        {recommendation.displaySteps.map((step, index) => (
          <li key={index}>
            {step.content}
            {step.redacted ? " (redacted)" : ""}
            {step.truncated ? " (truncated)" : ""}
          </li>
        ))}
      </ol>
      {recommendation.displayStepsOmitted ? (
        <p className="mt-1 text-xs text-base-content/70">
          Additional saved steps are not shown here.
        </p>
      ) : null}
    </div>
  );
}
