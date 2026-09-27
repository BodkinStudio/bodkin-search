import { Link } from "@tanstack/react-router";
export function AnalyticsInspectionState({
  projectId,
  enabled,
  admin,
}: {
  projectId: string;
  enabled: boolean;
  admin: boolean;
}) {
  return (
    <section
      className="max-w-xl rounded-lg border border-base-300 p-6"
      aria-labelledby="inspection-title"
    >
      <h2 id="inspection-title" className="font-semibold">
        {enabled
          ? "Individual inspection requires administrator access"
          : "Individual journey inspection is disabled"}
      </h2>
      <p className="mt-2 text-sm text-base-content/70">
        {enabled
          ? "Aggregate reports remain available. Ask a workspace administrator to inspect personal journeys and customer evidence."
          : "This project permits aggregate reporting only. A workspace administrator can enable individual inspection when the client’s consent and privacy policy allow it."}
      </p>
      {admin && (
        <Link
          to="/p/$projectId/settings/analytics"
          params={{ projectId }}
          className="btn btn-outline btn-sm mt-4"
        >
          Review tracking permissions
        </Link>
      )}
    </section>
  );
}

export function AnalyticsNoActivity({
  projectId,
  canAdminister,
}: {
  projectId: string;
  canAdminister: boolean;
}) {
  return (
    <section
      className="rounded-lg border border-base-300 p-5"
      aria-labelledby="no-activity-title"
    >
      <h2 id="no-activity-title" className="font-semibold">
        No permitted activity recorded in this period
      </h2>
      <p className="mt-2 text-sm text-base-content/70">
        Check the environment and date range. Ask a workspace administrator to
        verify tracking if activity is still missing. Unobserved activity is not
        evidence of zero visitors.
      </p>
      {canAdminister && (
        <Link
          to="/p/$projectId/settings/analytics"
          params={{ projectId }}
          className="btn btn-outline btn-sm mt-4"
        >
          Check tracking setup
        </Link>
      )}
    </section>
  );
}
