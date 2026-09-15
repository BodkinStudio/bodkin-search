import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { createSamSession } from "@/serverFunctions/sam";
import { LABS_LOCATION_OPTIONS } from "@/shared/keyword-locations";
import type { CompetitorResearchResult } from "@/shared/competitorResearch";
import { useSaveKeywordsMutation } from "@/client/features/domain/mutations";
import { invalidateSamSessions } from "@/client/features/sam/samQueries";
import { saveSamResearchDraft } from "@/client/features/sam/samResearchDraft";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  buildCompetitorAnalysisDraft,
  rankingDifference,
  researchSourceUrl,
} from "./competitorResearchPresentation";

export function ResearchResults({
  projectId,
  result,
}: {
  projectId: string;
  result: CompetitorResearchResult;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [aheadOnly, setAheadOnly] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const save = useSaveKeywordsMutation({ projectId, queryClient });
  const selectedRows = result.rows.filter((row) => selected.has(row.keyword));
  const rows = result.rows.filter(
    (row) =>
      row.keyword.toLowerCase().includes(filter.toLowerCase()) &&
      (!aheadOnly || rankingDifference(row) === "Competitor ahead"),
  );
  const draft = useMutation({
    mutationFn: async () => {
      const text = buildCompetitorAnalysisDraft(result, [...selected]);
      const session = await createSamSession({ data: { projectId } });
      saveSamResearchDraft(projectId, session.id, text);
      invalidateSamSessions(projectId);
      await navigate({
        to: "/p/$projectId/sam",
        params: { projectId },
        search: { s: session.id },
      });
    },
    retry: false,
  });
  return (
    <section className="space-y-4" aria-labelledby="comparison-title">
      <div className="space-y-2">
        <h2 id="comparison-title" className="text-lg font-semibold">
          {result.competitorDomain} compared with {result.projectDomain}
        </h2>
        <p className="text-sm text-base-content/70">
          {LABS_LOCATION_OPTIONS.find(
            (item) => item.code === result.locationCode,
          )?.label ?? result.locationCode}{" "}
          · {result.languageCode} · DataForSEO · Retrieved{" "}
          {new Date(result.fetchedAt).toLocaleString()}
        </p>
        {result.topic ? (
          <p className="text-sm">
            Topic: <strong>{result.topic}</strong>
          </p>
        ) : null}
        <p className="text-sm text-base-content/70">
          Provider estimates, not live rank tracking. “Not reported” does not
          prove your site has no ranking. A ranking advantage alone does not
          establish business relevance.
        </p>
        {result.warnings.length ? (
          <ul className="list-disc pl-5 text-sm text-base-content/70">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        <Link
          to="/p/$projectId/domain"
          params={{ projectId }}
          search={{ domain: result.competitorDomain, loc: result.locationCode }}
          className="link text-sm"
        >
          Explore this competitor’s keywords and pages (paid research)
        </Link>
      </div>
      {result.rows.length === 0 ? (
        <p className="rounded-lg border border-base-300 p-5">
          No competitor keywords were returned for this market. Try another
          market or competitor; this is not proof of no search visibility.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Filter keywords
              <input
                type="search"
                className="input input-bordered input-sm"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="e.g. business messaging"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={aheadOnly}
                onChange={(event) => setAheadOnly(event.target.checked)}
              />
              Competitor ahead only
            </label>
            <span className="text-sm text-base-content/70">
              {rows.length} of {result.rows.length} keywords · {selected.size}{" "}
              selected
            </span>
          </div>
          <div
            className="max-h-[32rem] overflow-auto rounded-lg border border-base-300"
            role="region"
            aria-label="Keyword ranking comparison"
            tabIndex={0}
          >
            <table className="table table-sm w-full">
              <thead className="sticky top-0 z-10 bg-base-200">
                <tr>
                  <th scope="col">Select</th>
                  <th scope="col">Keyword</th>
                  <th scope="col">Monthly volume</th>
                  <th scope="col">Competitor rank</th>
                  <th scope="col">Your rank</th>
                  <th scope="col">Comparison</th>
                  <th scope="col">Ranking pages</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.keyword}>
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        aria-label={`Select ${row.keyword}`}
                        checked={selected.has(row.keyword)}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(row.keyword)) next.delete(row.keyword);
                            else next.add(row.keyword);
                            return next;
                          })
                        }
                      />
                    </td>
                    <th scope="row" className="min-w-44 font-medium">
                      {row.keyword}
                    </th>
                    <td>{row.searchVolume?.toLocaleString() ?? "Unknown"}</td>
                    <td>{row.competitorPosition ?? "Not reported"}</td>
                    <td>{row.projectPosition ?? "Not reported"}</td>
                    <td className="whitespace-nowrap">
                      {rankingDifference(row)}
                    </td>
                    <td className="space-y-1">
                      <SourceLink
                        url={row.competitorUrl}
                        label={`Competitor page for ${row.keyword}`}
                      >
                        Competitor page
                      </SourceLink>
                      <SourceLink
                        url={row.projectUrl}
                        label={`Your page for ${row.keyword}`}
                      >
                        Your page
                      </SourceLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="p-4 text-sm">No rows match these filters.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="btn btn-primary btn-sm"
              disabled={!selected.size || save.isPending}
              onClick={() =>
                save.mutate(
                  {
                    projectId,
                    keywords: selectedRows.map((row) => row.keyword),
                    locationCode: result.locationCode,
                    languageCode: result.languageCode,
                    tags: ["competitor-research"],
                    tagMode: "append",
                    metrics: selectedRows.map((row) => ({
                      keyword: row.keyword,
                      searchVolume: row.searchVolume,
                      cpc: row.cpc,
                      keywordDifficulty: row.keywordDifficulty,
                    })),
                  },
                  { onSuccess: () => setSavedCount(selectedRows.length) },
                )
              }
            >
              {save.isPending ? "Saving…" : `Save selected (${selected.size})`}
            </button>
            <button
              className="btn btn-outline btn-sm"
              disabled={!selected.size || selected.size > 10 || draft.isPending}
              onClick={() => draft.mutate()}
            >
              {draft.isPending ? "Preparing draft…" : "Review in AI chat"}
            </button>
            <Link
              to="/p/$projectId/saved"
              params={{ projectId }}
              className="link text-sm"
            >
              Saved Keywords → Rank Tracking
            </Link>
          </div>
          <p className="text-sm text-base-content/70">
            Select terms to save or up to 10 to analyse. AI chat opens an
            editable draft; nothing is sent automatically. Select saved terms in
            Saved Keywords and choose Track keywords to review tracking settings
            and cost.
          </p>
          {savedCount ? (
            <p role="status" className="text-sm">
              Saved {savedCount} keywords to this project with the
              competitor-research tag.
            </p>
          ) : null}
          {save.isError || draft.isError ? (
            <p role="alert" className="text-sm text-error">
              {getStandardErrorMessage(
                save.error ?? draft.error,
                "Could not complete the action. Try again.",
              )}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function SourceLink({
  url,
  label,
  children,
}: {
  url: string | null;
  label: string;
  children: string;
}) {
  const safe = researchSourceUrl(url);
  return safe ? (
    <a
      className="link block whitespace-nowrap"
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
    >
      {children}
    </a>
  ) : null;
}
