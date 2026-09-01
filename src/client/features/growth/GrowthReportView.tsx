import type { GrowthMonthlyReportDto } from "@/types/schemas/growth-monthly-reports";
import {
  formatGrowthReportDate,
  formatGrowthReportFact,
  formatGrowthReportMonth,
  formatGrowthReportTimestamp,
} from "./GrowthReportPresentation";

type SavedMonthlyReport = Extract<GrowthMonthlyReportDto, { state: "report" }>;

export function GrowthReportView({ data }: { data: SavedMonthlyReport }) {
  const title = `${formatGrowthReportMonth(data.periodStart)} Growth summary`;
  return (
    <article
      aria-labelledby="growth-monthly-report-document-title"
      className="mt-5 border-t border-base-300 pt-5 [overflow-wrap:anywhere]"
    >
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h3
            id="growth-monthly-report-document-title"
            className="text-xl font-semibold"
          >
            {title}
          </h3>
          <span className="badge badge-outline">
            {data.report.status === "draft" ? "Draft" : "Published"}
          </span>
          <span className="text-xs text-base-content/70">
            Version {data.report.version}
          </span>
        </div>
        <p className="mt-2 max-w-prose text-sm text-base-content/70">
          This is a frozen internal summary of the saved Growth record. It does
          not update when Work or Measurements change later.
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-base-content/70">Reporting period</dt>
            <dd className="font-medium tabular-nums">
              {formatGrowthReportDate(data.periodStart)}–
              {formatGrowthReportDate(data.periodEnd)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-base-content/70">Report timezone</dt>
            <dd className="font-medium">{data.reportTimezone}</dd>
          </div>
          <div>
            <dt className="text-xs text-base-content/70">Generated</dt>
            <dd className="font-medium tabular-nums">
              {formatGrowthReportTimestamp(data.report.generatedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-base-content/70">Data cutoff</dt>
            <dd className="font-medium tabular-nums">
              {formatGrowthReportTimestamp(data.report.dataCutoffAt)}
            </dd>
          </div>
        </dl>
      </header>

      <div className="mt-6 divide-y divide-base-300 border-y border-base-300">
        {data.report.sections.map((section, sectionIndex) => {
          const headingId = `growth-report-${section.sectionType}`;
          return (
            <section
              key={`${section.sectionType}:${sectionIndex}`}
              aria-labelledby={headingId}
              className="py-5"
            >
              <h4 id={headingId} className="text-base font-semibold">
                {section.title}
              </h4>
              <p className="mt-1 max-w-3xl text-sm text-base-content/70">
                {section.summary}
              </p>
              {section.items.length > 0 ? (
                <ol className="mt-4 space-y-4">
                  {section.items.map((item, itemIndex) => (
                    <li key={`${section.sectionType}:${itemIndex}`}>
                      <h5 className="text-sm font-semibold">{item.title}</h5>
                      <p className="mt-1 max-w-3xl text-sm">{item.summary}</p>
                      {item.facts.length > 0 ? (
                        <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                          {item.facts.map((fact, factIndex) => (
                            <div
                              key={`${section.sectionType}:${itemIndex}:${factIndex}`}
                            >
                              <dt className="text-xs text-base-content/70">
                                {fact.label}
                              </dt>
                              <dd className="font-medium tabular-nums">
                                {formatGrowthReportFact(fact.value)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          );
        })}
      </div>
    </article>
  );
}
