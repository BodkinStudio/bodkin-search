import type { Ref } from "react";
import { ShieldCheck } from "lucide-react";
import type {
  GrowthPreview,
  GrowthPreviewPage,
} from "@/types/schemas/growth-preview";
import {
  describeGrowthPreviewPage,
  formatGrowthPreviewCount,
  formatGrowthPreviewDate,
} from "./GrowthPreviewPresentation";

const CONTEXT_LABELS = {
  business_overview: "Business",
  current_goal: "Current goal",
  positioning: "Positioning",
};

export function GrowthPreviewDetail({
  page,
  data,
  headingRef,
}: {
  page: GrowthPreviewPage;
  data: GrowthPreview;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const copy = describeGrowthPreviewPage(page);
  const observation =
    page.status === "flagged" ? page.evidence.observation : page;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h2
            id="growth-detail-title"
            ref={headingRef}
            tabIndex={-1}
            className="scroll-mt-16 text-xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            {page.label}
          </h2>
          <span className="badge badge-outline text-xs">
            {page.status === "flagged"
              ? page.severity === "critical"
                ? "Critical decline"
                : "Click decline"
              : "No signal"}
          </span>
        </div>
        <p className="mt-1 break-all text-sm text-base-content/70">
          {page.url}
        </p>
      </header>

      <section aria-label="Observed search clicks">
        <h3 className="text-sm font-semibold">
          {page.status === "flagged" ? "Search clicks declined" : copy.label}
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-4 border-y border-base-300 py-4">
          <div>
            <dt className="text-sm text-base-content/70">Baseline clicks</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {formatGrowthPreviewCount(observation.baselineClicks)}
            </dd>
            <dd className="mt-1 text-xs text-base-content/70">
              {formatGrowthPreviewDate(data.baselineWindow.startDate)} to{" "}
              {formatGrowthPreviewDate(data.baselineWindow.endDate)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-base-content/70">
              Current-period clicks
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {formatGrowthPreviewCount(observation.currentClicks)}
            </dd>
            <dd className="mt-1 text-xs text-base-content/70">
              {formatGrowthPreviewDate(data.currentWindow.startDate)} to{" "}
              {formatGrowthPreviewDate(data.currentWindow.endDate)}
            </dd>
          </div>
        </dl>
        {page.status === "flagged" ? (
          <p className="mt-3 text-base font-semibold tabular-nums">
            {formatGrowthPreviewCount(-page.evidence.observation.deltaClicks)}{" "}
            fewer clicks
            <span className="ml-2 text-sm font-medium">
              ({page.evidence.observation.deltaPercent.toFixed(1)}%)
            </span>
          </p>
        ) : null}
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-base-content/80">
          {copy.explanation}
        </p>
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-base-content/70">
          Rule thresholds: at least {data.thresholds.minimumBaselineClicks}{" "}
          baseline clicks, {data.thresholds.minimumLostClicks} lost clicks and a{" "}
          {data.thresholds.minimumDeclinePercent * 100}% decline. Site-wide
          movement is considered when available.
        </p>
      </section>

      {page.status === "flagged" ? (
        <GrowthPreviewEvidence page={page} />
      ) : (
        <p className="text-sm text-base-content/70">
          No evidence packet or recommendation was created for this page. This
          rule alone cannot tell you whether the page needs other work.
        </p>
      )}

      <p className="border-t border-base-300 pt-4 text-sm text-base-content/70">
        This preview stops at evidence. No AI interpretation or recommendation
        has been generated, and nothing has been approved or saved.
      </p>
    </div>
  );
}

function GrowthPreviewEvidence({
  page,
}: {
  page: Extract<GrowthPreviewPage, { status: "flagged" }>;
}) {
  const packet = page.evidence;
  return (
    <>
      <section aria-labelledby="growth-context-title">
        <h3 id="growth-context-title" className="text-base font-semibold">
          Current sample context
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-base-content/70">
          Fictional context updated{" "}
          {formatGrowthPreviewDate(packet.subject.updatedAt)}. This is not a
          historical record of what was true during the comparison.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="badge badge-outline text-xs">
            Commercial weight {packet.subject.commercialWeight ?? "not set"}
          </span>
          {packet.subject.protected ? (
            <span className="badge badge-outline gap-1 text-xs">
              <ShieldCheck size={13} aria-hidden="true" /> Protected page
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-base-content/80">
          {packet.subject.notes}
        </p>
        <p className="mt-2 text-xs text-base-content/70 tabular-nums">
          Priority score {page.priority}:{" "}
          {formatGrowthPreviewCount(-packet.observation.deltaClicks)} lost
          clicks × commercial weight {packet.subject.commercialWeight ?? 1}.
          This is a sorting rule, not a predicted outcome.
        </p>
        <dl className="mt-4 space-y-3 text-sm">
          {packet.currentCommercialContext.sections.map((section) => (
            <div key={section.key}>
              <dt className="font-medium">{CONTEXT_LABELS[section.key]}</dt>
              <dd className="mt-1 max-w-prose leading-relaxed text-base-content/70">
                {section.content ?? "Not provided"}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="growth-changes-title">
        <h3 id="growth-changes-title" className="text-base font-semibold">
          Selected sample change history
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-base-content/70">
          A partial selection, not a complete change log. A matching URL and
          overlapping date do not show that a change caused the decline.
        </p>
        <ul className="mt-3 space-y-3 text-sm">
          {packet.selectedChangeEvents.events.map((event) => (
            <li key={event.id}>
              <p className="font-medium">
                {formatGrowthPreviewDate(event.happenedAt)} · Manual sample
              </p>
              <p className="mt-1 max-w-prose leading-relaxed text-base-content/70">
                {event.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <details className="border-t border-base-300 pt-4">
        <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          Source details and limitations
        </summary>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-medium">Sample captured</dt>
            <dd className="mt-1 text-base-content/70">
              {packet.observation.capturedAt}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Detector version</dt>
            <dd className="mt-1 break-all text-base-content/70">
              {packet.source.detectorVersion}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Evidence reference</dt>
            <dd className="mt-1 break-all font-mono text-xs leading-relaxed text-base-content/70">
              {packet.source.evidenceReference}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Packet reference</dt>
            <dd className="mt-1 break-all font-mono text-xs leading-relaxed text-base-content/70">
              {packet.packetReference}
            </dd>
          </div>
        </dl>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-base-content/70">
          {packet.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
