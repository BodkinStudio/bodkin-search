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
      <h2 className="text-lg font-semibold">Funnel stages</h2>
      <div className="flex flex-wrap gap-2" aria-label="Funnel template">
        {(
          [
            ["enquiry", "Website enquiry"],
            ["signup", "Browser signup"],
            ["external", "External product"],
            ["sales", "Sales-led customer"],
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
        Observed stages use a defined cohort and completion window. “Not
        observed” means tracking coverage is absent, not proven abandonment.
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
          {data.stages.map((stage, index) => (
            <div
              key={stage.name}
              className="flex items-center justify-between border-b border-base-300 py-4"
            >
              <span className="text-sm">
                <span className="mr-4 text-base-content/60">{index + 1}</span>
                {stage.label ?? stage.name.replaceAll("_", " ")}
              </span>
              <span className="text-sm tabular-nums">
                {stage.coverage === "Not observed"
                  ? "Not observed"
                  : stage.count}
              </span>
            </div>
          ))}
          {!!data.unknown && (
            <p className="text-sm">
              {data.unknown} journeys have incomplete coverage; their completion
              is unknown.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <caption className="text-left font-medium">Entry cohort</caption>
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
                        Visitor {c.contextId.slice(0, 6)}
                      </button>
                    </td>
                    <td>{c.enteredAt.slice(0, 10)}</td>
                    <td>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                      <button
                        className="text-primary hover:underline"
                        onClick={() => onOpenCustomer(customer.id)}
                      >
                        Inspect evidence
                      </button>
                      {journey && (
                        <button
                          className="mt-2 text-primary hover:underline"
                          onClick={() => onOpenJourney(journey.contextId)}
                        >
                          View journey
                        </button>
                      )}
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
