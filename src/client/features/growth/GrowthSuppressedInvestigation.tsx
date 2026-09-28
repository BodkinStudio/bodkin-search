import type { GrowthInvestigationView } from "@/types/schemas/growth-investigations";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";

type SuppressedInvestigation = Extract<
  GrowthInvestigationView,
  { relationship: "suppressed" }
>;

const suppressionReasonCopy: Record<
  SuppressedInvestigation["suppressionReason"],
  string
> = {
  existing_proposal: "another saved suggestion already covered this issue",
  existing_snooze: "a snoozed suggestion already covered this issue",
  prior_dismissal: "this issue had already been reviewed and dismissed",
  existing_action: "existing work already covered this issue",
  accepted_without_action: "an accepted suggestion already covered this issue",
  resolved_recommendation:
    "a previous resolved suggestion already covered this issue",
};

export function GrowthSuppressedInvestigation({
  saved,
  refreshFailed,
  onRetry,
}: {
  saved: SuppressedInvestigation;
  refreshFailed: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="mt-3 space-y-3 text-sm [overflow-wrap:anywhere]">
      {refreshFailed ? (
        <div role="alert" className="space-y-2">
          <p>
            This coverage decision could not be refreshed. The last saved
            version is shown below.
          </p>
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            Retry investigation
          </button>
        </div>
      ) : null}
      <h4 className="font-semibold">Covered by an existing suggestion</h4>
      <p role="status">
        This check was saved as new evidence without creating another
        suggestion.
      </p>
      <p className="text-base-content/70">
        When it was saved, {suppressionReasonCopy[saved.suppressionReason]}.
      </p>
      <p>
        <span className="font-medium">{saved.title}</span> is the controlling
        suggestion. Its current status is {saved.status}.
      </p>
      {saved.actionId ? (
        <p>
          The controlling suggestion is in your work list.
          {saved.dueOn
            ? ` Due ${formatGrowthPreviewDate(saved.dueOn)} (UTC).`
            : ""}{" "}
          <a className="link font-medium" href="#growth-work">
            View work
          </a>
        </p>
      ) : null}
    </div>
  );
}
