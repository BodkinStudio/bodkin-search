import { useQuery } from "@tanstack/react-query";
import { getGrowthChangeLog } from "@/serverFunctions/growthChangeLog";
import { formatGrowthPreviewDate } from "../GrowthPreviewPresentation";
import { GROWTH_CHANGE_LABELS } from "../GrowthChangePresentation";
import { SECTION, SECTION_SUB, SECTION_TITLE } from "./GrowthPlanPresentation";

export function GrowthPlanLedger({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["growthChangeLog", projectId],
    queryFn: () => getGrowthChangeLog({ data: { projectId } }),
    retry: false,
  });
  const changes = query.data?.changes.slice(0, 10) ?? [];

  return (
    <section
      id="growth-plan-ledger"
      aria-labelledby="growth-plan-ledger-title"
      className={SECTION}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="growth-plan-ledger-title" className={SECTION_TITLE}>
          What changed, and what happened
        </h2>
        <p className={SECTION_SUB}>
          A record of work done, not proof that it caused a result
        </p>
      </div>
      {query.isPending ? (
        <p role="status" aria-busy="true" className="mt-4 text-sm">
          Loading recent changes…
        </p>
      ) : null}
      {query.isError ? (
        <p role="alert" className="mt-4 text-sm">
          Recent changes could not be loaded.
        </p>
      ) : null}
      {query.data && changes.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-base-content/60">
          No changes recorded yet.
        </p>
      ) : null}
      {changes.length > 0 ? (
        <ol className="mt-4 divide-y divide-base-300">
          {changes.map((change) => (
            <li key={change.id} className="py-3 first:pt-0 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-medium">
                  {GROWTH_CHANGE_LABELS[change.changeType]}
                </p>
                <p className="tabular-nums text-base-content/70">
                  {formatGrowthPreviewDate(change.happenedAt)} (UTC)
                </p>
              </div>
              <p className="mt-1 max-w-prose whitespace-pre-wrap [overflow-wrap:anywhere]">
                {change.description}
              </p>
              <ul className="mt-1 text-base-content/70">
                {change.displayUrls.map((url, index) => (
                  <li key={`${index}:${url}`} className="break-all">
                    {url ?? "Page URL withheld"}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
