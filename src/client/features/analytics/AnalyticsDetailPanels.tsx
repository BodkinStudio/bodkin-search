import { humanizeEvent, visitorLabel } from "./AnalyticsOverview";
import { AttributionLabel } from "./AnalyticsOverview";

type Funnel = {
  unknown?: number;
  cohorts?: {
    contextId: string;
    enteredAt: string;
    stage: number;
    status: string;
  }[];
  stages: Array<{
    name: string;
    label?: string;
    count: number;
    coverage?: string;
  }>;
  cohortSize: number;
  completed?: number;
  pending: number;
  notCompleted?: number;
  completionWindow: string;
  definition?: string;
};
export function AnalyticsFunnelPanel({
  data,
  pending,
  error,
  template,
  onTemplate,
  onOpenJourney,
}: {
  template: "enquiry" | "signup" | "external" | "sales";
  onTemplate: (template: "enquiry" | "signup" | "external" | "sales") => void;
  onOpenJourney: (context: string) => void;
  data: Funnel | undefined;
  pending: boolean;
  error: boolean;
}) {
  return (
    <div className="max-w-3xl space-y-5">
      <h2 className="text-lg font-semibold">Funnel</h2>
      <div className="flex flex-wrap gap-2" aria-label="Funnel template">
        {(
          [
            ["enquiry", "Enquiry form"],
            ["signup", "Sign-up on the site"],
            ["external", "Sign-up in your app"],
            ["sales", "Sales-led"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`btn btn-sm ${template === key ? "btn-primary" : "btn-ghost"}`}
            aria-pressed={template === key}
            onClick={() => onTemplate(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-sm text-base-content/70">
        Follows the visitors who entered in this period through each step.
        &ldquo;Not tracked&rdquo; means we can&rsquo;t see that step, not that
        people dropped out.
      </p>
      {pending ? (
        <p>Loading stages…</p>
      ) : error || !data ? (
        <p role="alert">Could not load stages.</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 rounded-lg border border-base-300 p-4 text-sm">
            <div>
              <dt className="text-base-content/60">Cohort</dt>
              <dd className="font-medium tabular-nums">{data.cohortSize}</dd>
            </div>
            <div>
              <dt className="text-base-content/60">Completed</dt>
              <dd className="font-medium tabular-nums">
                {data.completed ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-base-content/60">Pending</dt>
              <dd className="font-medium tabular-nums">{data.pending}</dd>
            </div>
          </dl>
          <ol className="space-y-3">
            {data.stages.map((stage, index) => {
              const first = data.stages[0]?.count ?? 0;
              // Compare with the last step we can see; untracked steps in
              // between say nothing about drop-off.
              const previousIndex = data.stages.findLastIndex(
                (candidate, i) =>
                  i < index && candidate.coverage !== "Not observed",
              );
              const previous =
                previousIndex >= 0 ? data.stages[previousIndex] : null;
              const tracked = stage.coverage !== "Not observed";
              return (
                <li key={stage.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      <span className="mr-3 tabular-nums text-base-content/60">
                        {index + 1}
                      </span>
                      {humanizeEvent(stage.label ?? stage.name)}
                    </span>
                    <span className="tabular-nums">
                      {tracked ? stage.count : "Not tracked"}
                      {tracked &&
                      previous &&
                      previous.coverage !== "Not observed" &&
                      previous.count > 0 ? (
                        <span className="ml-2 text-xs text-base-content/60">
                          {Math.round((stage.count / previous.count) * 100)}% of
                          step {previousIndex + 1}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-base-200">
                    {tracked && first > 0 ? (
                      <div
                        aria-hidden="true"
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${(stage.count / first) * 100}%` }}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
          {!!data.unknown && (
            <p className="text-sm">
              {data.unknown} journeys have incomplete coverage; their completion
              is unknown.
            </p>
          )}
          <details className="overflow-x-auto">
            <summary className="cursor-pointer text-sm font-medium">
              Visitors in this funnel ({data.cohorts?.length ?? 0})
            </summary>
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Journey</th>
                  <th>Entered</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.cohorts?.map((c) => (
                  <tr key={c.contextId}>
                    <td>
                      <button
                        className="text-primary"
                        onClick={() => onOpenJourney(c.contextId)}
                      >
                        {visitorLabel(c.contextId)}
                      </button>
                    </td>
                    <td>{c.enteredAt.slice(0, 10)}</td>
                    <td>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <p className="text-xs text-base-content/60">
            {data.definition ?? `Completion window: ${data.completionWindow}`}
          </p>
        </>
      )}
    </div>
  );
}

type Customer = {
  id: string;
  organizationId: string;
  issuer: string;
  acquiredAt: string | null;
  method: string;
  lifecycle: string;
  onboarding?: {
    status: string;
    coverage: string;
    startedAt: string | null;
    completedAt: string | null;
  };
  contextId: string | null;
};
type Journey = { contextId: string; organizationId: string | null };
export function AnalyticsCustomerPanel({
  data,
  pending,
  error,
  journeys,
  onOpenJourney,
  onOpenCustomer,
}: {
  projectId: string;
  onOpenCustomer: (id: string) => void;
  data: Customer[] | undefined;
  pending: boolean;
  error: boolean;
  journeys: Journey[] | undefined;
  onOpenJourney: (id: string) => void;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Customers and acquisition</h2>
      <p className="text-sm text-base-content/70">
        Verified customer units. Invited users inherit the organisation’s source
        without adding an acquisition.
      </p>
      {pending ? (
        <p>Loading customers…</p>
      ) : error || !data ? (
        <p role="alert">
          Individual customer inspection is unavailable for this project.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Identity issuer</th>
                <th>Acquired</th>
                <th>Connection</th>
                <th>Onboarding</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {data.map((customer) => {
                const journey = journeys?.find(
                  (candidate) =>
                    candidate.organizationId === customer.organizationId,
                );
                return (
                  <tr key={`${customer.issuer}:${customer.organizationId}`}>
                    <td className="font-medium">{customer.organizationId}</td>
                    <td>{customer.issuer}</td>
                    <td>
                      {customer.acquiredAt?.slice(0, 10) ?? "Not acquired"}
                    </td>
                    <td>
                      <AttributionLabel method={customer.method} />
                    </td>
                    <td>
                      <p className="max-w-64 text-xs">
                        {customer.onboarding?.status ??
                          "No onboarding evidence"}
                      </p>
                      <p className="mt-1 text-xs text-base-content/60">
                        Coverage: {customer.onboarding?.coverage ?? "Unknown"}
                      </p>
                    </td>
                    <td>
                      <div className="flex flex-col items-start gap-1 whitespace-nowrap">
                        <button
                          className="text-primary hover:underline"
                          onClick={() => onOpenCustomer(customer.id)}
                        >
                          Inspect evidence
                        </button>
                        {journey && (
                          <button
                            className="text-primary hover:underline"
                            onClick={() => onOpenJourney(journey.contextId)}
                          >
                            View journey
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!data.length && (
            <p className="py-10 text-center text-sm text-base-content/70">
              No verified customer acquisition in this period.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
