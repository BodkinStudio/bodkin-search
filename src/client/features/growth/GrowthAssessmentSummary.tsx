import type { getGrowthAssessment } from "@/serverFunctions/growthAssessments";
type Assessment = NonNullable<Awaited<ReturnType<typeof getGrowthAssessment>>>;

function readableEvidence(value: string) {
  return value
    .split("\n\n")
    .map((paragraph) => {
      if (!paragraph.startsWith("gsc_")) return paragraph;
      return paragraph
        .replace("gsc_impressions", "Search impressions")
        .replace("gsc_average_position", "Average search position")
        .replace("gsc_clicks", "Search clicks")
        .replace("gsc_ctr", "Search click-through rate")
        .replace(" on search_query ", " for query ")
        .replace(
          /: (-?[\d.]+) to (-?[\d.]+) \(([+-]?[\d.]+), ([+-]?[\d.]+)%\)/,
          (
            _match,
            baseline: string,
            current: string,
            delta: string,
            percent: string,
          ) =>
            `: ${Number(baseline).toLocaleString("en-GB", { maximumFractionDigits: 2 })} to ${Number(current).toLocaleString("en-GB", { maximumFractionDigits: 2 })} (${Number(delta).toLocaleString("en-GB", { maximumFractionDigits: 2, signDisplay: "exceptZero" })}, ${Number(percent).toFixed(2)}%)`,
        );
    })
    .join("\n\n");
}

export function GrowthAssessmentSummary({
  assessment,
  onEdit,
  keyPages,
  projectId,
}: {
  assessment: Assessment;
  onEdit: () => void;
  keyPages: { id: string; url: string }[];
  projectId: string;
}) {
  const selected = assessment.options.find(
    (option) => option.id === assessment.selectedOptionId,
  );
  const alternatives = assessment.options.filter(
    (option) => option.id !== assessment.selectedOptionId,
  );
  const page = keyPages.find((item) => item.id === selected?.keyPageId);
  const investigation = selected?.kind !== "page";
  const citedPageUrl =
    page?.url ??
    selected?.evidenceScope.match(
      /Canonical affected page: (https?:\/\/[^\s]+)\./,
    )?.[1] ??
    selected?.observation.match(
      /(?:result URL | on )(https?:\/\/[^\s]+)\./,
    )?.[1];
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-medium text-base-content/65">
        {assessment.status === "ready"
          ? investigation
            ? "Agreed investigation"
            : "Agreed direction"
          : investigation
            ? "Suggested investigation"
            : "Suggested page work"}
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-balance">
        {selected?.title || "No next step identified yet"}
      </h2>
      {page ? (
        <p className="mt-2 break-words text-sm text-base-content/65">
          {page.url}
        </p>
      ) : null}
      <p className="mt-3 text-base leading-relaxed text-base-content/80">
        {selected?.businessRelevance ||
          "Reassess to compare the available evidence."}
      </p>

      <div className="mt-6 border-l-2 border-primary pl-5">
        <h3 className="font-semibold">What to do next</h3>
        <p className="mt-2 whitespace-pre-line text-base leading-relaxed">
          {selected?.nextValidation ||
            "Generate a new suggestion to identify the next step."}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-base-content/75">
          <span className="font-medium text-base-content">
            What this should establish:{" "}
          </span>
          {assessment.successMeasure ||
            "The result of this check still needs to be defined."}
        </p>
        {citedPageUrl ? (
          <a
            className="btn btn-outline btn-sm mt-4 mr-3"
            href={citedPageUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open cited page
          </a>
        ) : null}
        <button
          className="btn btn-primary btn-sm mt-4 h-auto min-h-8 whitespace-normal"
          onClick={onEdit}
        >
          {assessment.status === "ready"
            ? "Review agreed context"
            : investigation
              ? "Review this investigation"
              : "Review this proposal"}
        </button>
        <p className="mt-2 text-xs leading-relaxed text-base-content/60">
          {investigation
            ? "This proposes a check. It does not establish that the page needs changing."
            : "Reviewing the proposal does not approve or publish a website change."}
        </p>
      </div>

      {selected ? (
        <div className="mt-7 space-y-5">
          <div>
            <h3 className="font-semibold">What supports this</h3>
            <Evidence option={selected} projectId={projectId} />
          </div>
          <div>
            <h3 className="font-semibold">What we don’t know yet</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-base-content/75">
              {selected.uncertainty}
            </p>
          </div>
        </div>
      ) : null}

      <details className="mt-6 border-t border-base-300 pt-4">
        <summary className="cursor-pointer text-sm font-medium">
          Why start with this check?
        </summary>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-base-content/75">
          {assessment.comparisonRationale || "No comparison has been recorded."}
        </p>
        {alternatives.map((option) => (
          <details
            key={option.id}
            className="mt-4 border-l border-base-300 pl-4"
          >
            <summary className="cursor-pointer text-sm font-medium">
              {option.title}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-base-content/75">
              {option.businessRelevance}
            </p>
            <Evidence option={option} projectId={projectId} />
            <p className="mt-3 text-sm leading-relaxed">
              <span className="font-medium">Next check: </span>
              {option.nextValidation}
            </p>
            <p className="mt-2 text-sm text-base-content/65">
              {option.uncertainty}
            </p>
          </details>
        ))}
      </details>
      <p className="mt-4 text-xs text-base-content/50">
        Saved suggestion · revision {assessment.version}
      </p>
    </div>
  );
}

function Evidence({
  option,
  projectId,
}: {
  option: Assessment["options"][number];
  projectId: string;
}) {
  const firstRecord = readableEvidence(
    (option.observation.split("\n\n")[0] || "").replace(
      /\. Severity [^\n]+; confidence [\d.]+\.?$/,
      ".",
    ),
  );
  const preview =
    firstRecord.length > 320
      ? firstRecord.slice(0, 320).replace(/\s+\S*$/, "") + "…"
      : firstRecord;
  const firstSource = option.evidenceSource
    .split("; ")[0]
    ?.replace(/\s[0-9a-f-]{24,}$/i, "")
    .replace(
      "Saved gsc_period Growth signal",
      "Saved Search Console measurement",
    );
  return (
    <div className="mt-2">
      <p className="text-xs text-base-content/60">
        {firstSource || "Saved record"}
      </p>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-base-content/80">
        {preview}
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-base-content/70">
          Sources, dates and scope
        </summary>
        <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-base-content/80">
          {readableEvidence(
            [...new Set(option.observation.split("\n\n"))].join("\n\n"),
          )}
        </p>
        <dl className="mt-2 space-y-2 border-l border-base-300 pl-3 text-xs text-base-content/70">
          {(
            [
              [
                "Source",
                option.evidenceSource
                  .split("; ")
                  .map((source) => source.replace(/\s[0-9a-f-]{24,}$/i, ""))
                  .join("\n"),
              ],
              [
                "Date",
                option.evidenceDate
                  .split("; ")
                  .map((date) => {
                    const parsed = new Date(date);
                    return Number.isNaN(parsed.getTime())
                      ? date
                      : parsed.toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "UTC",
                        }) + " UTC";
                  })
                  .join("\n"),
              ],
              [
                "Scope",
                option.evidenceScope.replaceAll("; Coverage:", "\n\nCoverage:"),
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="font-medium">{label}</dt>
              <dd className="mt-1 whitespace-pre-line break-words">
                {[...new Set(value.split("\n"))].join("\n") || "Not recorded"}
              </dd>
            </div>
          ))}
        </dl>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-base-content/60">
            Original records and identifiers
          </summary>
          <p className="mt-2 whitespace-pre-line break-words text-xs text-base-content/70">
            {option.evidenceSource}
            {"\n"}
            {option.evidenceDate}
            {"\n\n"}
            {option.observation}
          </p>
        </details>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          {option.evidenceSource.includes("Growth") ? (
            <a href="#growth-run-inspector" className="link">
              Inspect saved Growth evidence
            </a>
          ) : null}
          {option.evidenceSource.includes("rank") ? (
            <a href={`/p/${projectId}/rank-tracking`} className="link">
              Open rank tracking
            </a>
          ) : null}
          {option.evidenceSource.includes("audit") ? (
            <a href={`/p/${projectId}/audit`} className="link">
              Open site audit
            </a>
          ) : null}
          {option.evidenceSource.includes("research") ? (
            <a href={`/p/${projectId}/settings`} className="link">
              Open project research notes
            </a>
          ) : null}
        </div>
      </details>
    </div>
  );
}
