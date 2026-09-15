import type { CompetitorResearchRequest } from "@/shared/competitorResearch";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getProjectContext } from "@/serverFunctions/projectContext";
import { getProjects } from "@/serverFunctions/projects";
import { getCompetitorResearch } from "@/serverFunctions/competitorResearch";
import {
  LABS_LOCATION_OPTIONS,
  getLanguageCode,
} from "@/shared/keyword-locations";
import { projectContextQueryKey } from "@/client/features/projects/project-context/shared";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { ResearchResults } from "./ResearchResults";

export function CompetitorResearchPage({
  projectId,
  initialCompetitor,
}: {
  projectId: string;
  initialCompetitor?: string;
}) {
  const context = useQuery({
    queryKey: projectContextQueryKey(projectId),
    queryFn: () => getProjectContext({ data: { projectId } }),
    staleTime: 0,
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const project = projects.data?.find((item) => item.id === projectId);
  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Competitor research</h1>
            <p className="mt-1 max-w-2xl text-sm text-base-content/70">
              Compare ranking keywords, inspect the pages behind them and choose
              what is worth pursuing for your business.
            </p>
          </div>
          <Link
            to="/p/$projectId/settings/context"
            params={{ projectId }}
            className="btn btn-ghost btn-sm"
          >
            Manage competitors
          </Link>
        </header>
        {context.isPending || projects.isPending ? (
          <p role="status">Loading saved competitors…</p>
        ) : context.isError || projects.isError ? (
          <div role="alert" className="alert alert-error">
            <span>
              {getStandardErrorMessage(
                context.error ?? projects.error,
                "Could not load project research settings.",
              )}
            </span>
            <button
              className="btn btn-sm"
              onClick={() => {
                void context.refetch();
                void projects.refetch();
              }}
            >
              Retry
            </button>
          </div>
        ) : !project?.domain ? (
          <p>
            Add your website domain in project settings before comparing
            rankings.
          </p>
        ) : context.data.competitors.length === 0 ? (
          <div className="rounded-lg border border-base-300 p-6">
            <h2 className="font-semibold">Start with a competitor you know</h2>
            <p className="mt-2 text-sm text-base-content/70">
              Add a competitor in Project memory, then return here to compare
              keywords. Saving a competitor does not start paid research.
            </p>
            <Link
              to="/p/$projectId/settings/context"
              params={{ projectId }}
              className="btn btn-primary btn-sm mt-4"
            >
              Add a competitor
            </Link>
          </div>
        ) : (
          <ResearchForm
            key={`${projectId}:${initialCompetitor ?? ""}`}
            projectId={projectId}
            projectDomain={project.domain}
            initialCompetitor={initialCompetitor}
            locationCode={project.locationCode}
            languageCode={project.languageCode}
            competitors={context.data.competitors}
          />
        )}
      </div>
    </div>
  );
}

function ResearchForm({
  projectId,
  projectDomain,
  initialCompetitor,
  locationCode,
  languageCode,
  competitors,
}: {
  projectId: string;
  projectDomain: string;
  initialCompetitor?: string;
  locationCode: number;
  languageCode: string;
  competitors: Array<{ domain: string; name: string | null }>;
}) {
  const comparison = useMutation({
    mutationFn: (data: CompetitorResearchRequest) =>
      getCompetitorResearch({ data }),
    retry: false,
  });
  const form = useForm({
    defaultValues: {
      competitorDomain: competitors.some(
        (item) => item.domain === initialCompetitor,
      )
        ? initialCompetitor!
        : "",
      locationCode,
      languageCode,
      topic: "",
    },
    onSubmit: async ({ value }) => {
      if (comparison.isPending || !value.competitorDomain) return;
      comparison.reset();
      comparison.mutate({ projectId, ...value });
    },
  });
  return (
    <>
      <form
        className="rounded-lg border border-base-300 bg-base-100 p-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <p className="text-sm">
          Your site: <strong>{projectDomain}</strong>
        </p>
        <fieldset
          disabled={comparison.isPending}
          className="grid gap-3 md:grid-cols-2 md:items-end"
        >
          <form.Field name="competitorDomain">
            {(field) => (
              <label className="flex flex-col gap-1 text-sm">
                Saved competitor
                <select
                  required
                  className="select select-bordered w-full"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                >
                  <option value="">Choose a competitor</option>
                  {competitors.map((item) => (
                    <option key={item.domain} value={item.domain}>
                      {item.name ? `${item.name} · ` : ""}
                      {item.domain}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </form.Field>
          <form.Field name="locationCode">
            {(field) => (
              <label className="flex flex-col gap-1 text-sm">
                Search market
                <select
                  className="select select-bordered w-full"
                  value={field.state.value}
                  onChange={(event) => {
                    const code = Number(event.target.value);
                    field.handleChange(code);
                    form.setFieldValue(
                      "languageCode",
                      code === locationCode
                        ? languageCode
                        : getLanguageCode(code),
                    );
                  }}
                >
                  {!LABS_LOCATION_OPTIONS.some(
                    (item) => item.code === field.state.value,
                  ) ? (
                    <option value={field.state.value}>
                      Choose a supported market
                    </option>
                  ) : null}
                  {LABS_LOCATION_OPTIONS.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label} ·{" "}
                      {item.code === locationCode
                        ? languageCode
                        : item.languageCode}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </form.Field>
        </fieldset>
        <form.Field name="topic">
          {(field) => (
            <label className="flex flex-col gap-1 text-sm">
              Topic to research (optional)
              <input
                className="input input-bordered w-full md:max-w-md"
                maxLength={100}
                value={field.state.value}
                disabled={comparison.isPending}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="e.g. messaging or SMS"
                aria-describedby="competitor-topic-help"
              />
              <span id="competitor-topic-help" className="text-base-content/70">
                Find competitor keywords containing this phrase before selecting
                the top 50. Leave blank for their overall footprint.
              </span>
            </label>
          )}
        </form.Field>
        <p className="text-sm text-base-content/70">
          Checks up to 50 competitor keywords against your site. Up to two paid
          DataForSEO requests on a cache miss; billed through your existing
          research usage. Cached comparisons are reused for 12 hours. No
          recurring scan is enabled.
        </p>
        <div className="flex justify-end">
          {" "}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={comparison.isPending}
          >
            {comparison.isPending ? "Comparing…" : "Compare keywords"}
          </button>
        </div>
      </form>
      {comparison.isPending ? (
        <p role="status">
          Reading competitor keywords and checking your site’s reported
          rankings…
        </p>
      ) : null}
      {comparison.isError ? (
        <p role="alert" className="alert alert-error">
          {getStandardErrorMessage(
            comparison.error,
            "Comparison failed. Review the settings and try again.",
          )}
        </p>
      ) : null}
      {comparison.data ? (
        <ResearchResults
          key={comparison.submittedAt}
          projectId={projectId}
          result={comparison.data}
        />
      ) : null}
    </>
  );
}
