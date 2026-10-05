import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAnalyticsSettings,
  saveAnalyticsSettings,
  listAnalyticsSources,
} from "@/serverFunctions/analytics";
import { resolveEnvironment } from "./analytics-search";
import { AnalyticsTrackingChecklist } from "./AnalyticsTrackingHealth";
export function AnalyticsConfiguration({ projectId }: { projectId: string }) {
  const config = useQuery({
    queryKey: ["analyticsSettings", projectId],
    queryFn: () => getAnalyticsSettings({ data: { projectId } }),
  });
  const sources = useQuery({
    queryKey: ["analyticsSources", projectId],
    queryFn: () => listAnalyticsSources({ data: { projectId } }),
  });
  return (
    <>
      <AnalyticsTrackingChecklist
        projectId={projectId}
        environment={resolveEnvironment(undefined, sources.data)}
      />
      <section className="border-t border-base-300 pt-6">
        <h3 className="mb-4 font-medium">Measurement and access</h3>
        {config.data ? (
          <ConfigurationForm projectId={projectId} value={config.data} />
        ) : config.isError ? (
          <p role="alert">Could not load configuration.</p>
        ) : (
          <p>Loading configuration…</p>
        )}
      </section>
    </>
  );
}
function ConfigurationForm({
  projectId,
  value,
}: {
  projectId: string;
  value: Awaited<ReturnType<typeof getAnalyticsSettings>>;
}) {
  const [model, setModel] = useState(
    value.businessModel === "individual" ? "individual" : "organisation",
  );
  const [outcome, setOutcome] = useState(value.primaryOutcome);
  const [hours, setHours] = useState(value.matchingWindowHours);
  const [retention, setRetention] = useState(value.retentionDays);
  const [customerRetention, setCustomerRetention] = useState(
    value.customerRetentionDays,
  );
  const [personal, setPersonal] = useState(value.personalAccess);
  const [anonymous, setAnonymous] = useState(value.anonymousCollection);
  const [webhook, setWebhook] = useState(value.webhookUrl ?? "");
  const [target, setTarget] = useState(
    value.weeklyMqlTarget ? String(value.weeklyMqlTarget) : "",
  );
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      saveAnalyticsSettings({
        data: {
          projectId,
          businessModel: model === "individual" ? "individual" : "organisation",
          primaryOutcome:
            outcome === "activation_achieved"
              ? "activation_achieved"
              : outcome === "lead_qualified"
                ? "lead_qualified"
                : outcome === "customer_acquired"
                  ? "customer_acquired"
                  : outcome === "payment_succeeded"
                    ? "payment_succeeded"
                    : "registration_completed",
          matchingWindowHours: hours === 1 ? 1 : hours === 6 ? 6 : 24,
          retentionDays: retention,
          customerRetentionDays: customerRetention,
          personalAccess: personal,
          anonymousCollection: anonymous,
          webhookUrl: webhook || null,
          weeklyMqlTarget:
            Number.parseInt(target, 10) > 0
              ? Number.parseInt(target, 10)
              : null,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["analyticsSettings", projectId],
      });
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Customer unit
          <select
            className="select w-full"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="organisation">Organisation</option>
            <option value="individual">Individual</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Primary outcome
          <select
            className="select w-full"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="registration_completed">
              Registration completed
            </option>
            <option value="activation_achieved">Activated</option>
            <option value="lead_qualified">Qualified lead</option>
            <option value="customer_acquired">Customer acquired</option>
            <option value="payment_succeeded">First payment</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Qualified leads target per week
          <input
            type="number"
            min={1}
            inputMode="numeric"
            className="input w-full"
            placeholder="No target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <span className="text-xs text-base-content/70">
            Drawn as the target line on the qualified leads report.
          </span>
        </label>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="checkbox checkbox-sm mt-0.5"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
        />
        <span>
          Count visitors who haven&apos;t accepted cookies
          <span className="mt-1 block text-xs text-base-content/70">
            Nothing is stored on their device. Visits are keyed daily from IP
            address and browser. This relies on legitimate interest, so update
            your privacy notice first.
          </span>
        </span>
      </label>
      <label className="grid gap-1 text-sm">
        Click-to-entry window
        <select
          className="select w-full"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        >
          <option value={1}>1 hour</option>
          <option value={6}>6 hours</option>
          <option value={24}>24 hours</option>
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Journey detail retention (days)
          <input
            className="input w-full"
            type="number"
            min={7}
            max={90}
            value={retention}
            onChange={(e) => setRetention(e.target.valueAsNumber)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Customer detail retention (days)
          <input
            className="input w-full"
            type="number"
            min={30}
            max={730}
            value={customerRetention}
            onChange={(e) => setCustomerRetention(e.target.valueAsNumber)}
          />
        </label>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="checkbox checkbox-sm mt-0.5"
          checked={personal}
          onChange={(e) => setPersonal(e.target.checked)}
        />
        <span>
          Enable individual journey inspection for authorised project users
          <span className="mt-1 block text-xs text-base-content/70">
            Separate from aggregate reporting. Only enable where client policy
            permits. Detailed events expire after {retention} days. Personal
            inspection is restricted to analytics administrators.
          </span>
        </span>
      </label>
      <label className="grid gap-1 text-sm">
        Outbound webhook (optional)
        <input
          type="url"
          className="input w-full"
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder="https://your-integration.example/events"
        />
      </label>
      <p className="text-xs text-base-content/70">
        Signed deliveries retry with a stable customer and delivery-version key.
        The deployment must configure integration secrets before delivery.
      </p>
      <button className="btn btn-sm btn-primary" disabled={save.isPending}>
        Save configuration
      </button>
      {save.isSuccess && (
        <p role="status" className="text-sm">
          Configuration saved.
        </p>
      )}
      {save.isError && (
        <p role="alert" className="text-sm text-error">
          Could not save. A workspace administrator must configure analytics.
        </p>
      )}
    </form>
  );
}
