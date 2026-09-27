import { useState } from "react";
import { GrowthAssessmentPanel } from "./GrowthAssessmentPanel";
import { GrowthChangeLog } from "./GrowthChangeLog";
import { GrowthLiveReadiness } from "./GrowthLiveReadiness";
import { GrowthMonthlyReport } from "./GrowthMonthlyReport";
import { GrowthMonthlyReview } from "./GrowthMonthlyReview";
import { GrowthOperatingOverview } from "./GrowthOperatingOverview";
import { GrowthOpportunities } from "./GrowthOpportunities";
import { GrowthPriorityPageChecks } from "./GrowthPriorityPageChecks";
import { GrowthRunInspector } from "./GrowthRunInspector";
import { GrowthWork } from "./GrowthWork";
import { GROWTH_SECTIONS, type GrowthSectionName } from "./growthSectionList";

export function GrowthSection({
  projectId,
  section,
  runId,
  onOpenCheck,
  onSelectRun,
}: {
  projectId: string;
  section: GrowthSectionName;
  runId: string | null;
  // A work item or report points at the check run it came from.
  onOpenCheck: (runId: string) => void;
  onSelectRun: (runId: string | null) => void;
}) {
  const [showOpportunities, setShowOpportunities] = useState(
    () => window.location.hash === "#growth-opportunities",
  );
  const description = GROWTH_SECTIONS.find(
    (entry) => entry.value === section,
  )?.description;

  return (
    <div className="space-y-5">
      <p className="text-sm text-base-content/70">{description}</p>
      {section === "priorities" ? (
        <>
          <GrowthAssessmentPanel projectId={projectId} />
          <details
            open={showOpportunities}
            onToggle={(event) => setShowOpportunities(event.currentTarget.open)}
            className="rounded-lg border border-base-300 p-4"
          >
            <summary className="cursor-pointer font-medium">
              Browse saved opportunities
            </summary>
            <div className="mt-4">
              <GrowthOpportunities projectId={projectId} />
            </div>
          </details>
        </>
      ) : null}
      {section === "work" ? (
        <>
          <GrowthWork projectId={projectId} onOpenCheck={onOpenCheck} />
          <GrowthChangeLog projectId={projectId} />
        </>
      ) : null}
      {section === "reports" ? (
        <>
          <GrowthMonthlyReview
            projectId={projectId}
            onOpenCheck={onOpenCheck}
          />
          <GrowthMonthlyReport projectId={projectId} />
        </>
      ) : null}
      {section === "data" ? (
        <>
          <GrowthLiveReadiness projectId={projectId} />
          <GrowthOperatingOverview projectId={projectId} />
          <GrowthPriorityPageChecks
            projectId={projectId}
            selectedRunId={runId}
            onSelectRun={onSelectRun}
          />
          <GrowthRunInspector projectId={projectId} />
        </>
      ) : null}
    </div>
  );
}
