import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  getAnalyticsReportingSettings,
  saveAnalyticsReportingSettings,
  getAnalyticsStages,
  saveAnalyticsStages,
} from "@/serverFunctions/analyticsConfiguration";
import {
  analyticsEventNames,
  templateLabels,
  type FunnelTemplate,
  type FunnelStage,
} from "@/shared/analytics/funnels";
export function AnalyticsReportingSetup({ projectId }: { projectId: string }) {
  const settings = useQuery({
    queryKey: ["analyticsReportingSettings", projectId],
    queryFn: () => getAnalyticsReportingSettings({ data: { projectId } }),
  });
  return (
    <section className="space-y-6 border-t border-base-300 pt-6">
      <h3 className="font-medium">Reporting and completion</h3>
      {settings.data ? (
        <ReportingForm projectId={projectId} initial={settings.data} />
      ) : (
        <p role={settings.isError ? "alert" : "status"}>
          {settings.isError
            ? "Could not load reporting settings."
            : "Loading reporting settings…"}
        </p>
      )}
      <FunnelSetup projectId={projectId} />
    </section>
  );
}
function ReportingForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Awaited<ReturnType<typeof getAnalyticsReportingSettings>>;
}) {
  const [timezone, setTimezone] = useState(initial.timezone);
  const [days, setDays] = useState(initial.completionWindowDays);
  const [event, setEvent] = useState(initial.onboardingEvent);
  const [instrumented, setInstrumented] = useState(
    initial.onboardingInstrumented,
  );
  const [wait, setWait] = useState(initial.onboardingWaitDays);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      saveAnalyticsReportingSettings({
        data: {
          projectId,
          timezone,
          completionWindowDays: days,
          onboardingEvent: z.enum(analyticsEventNames).parse(event),
          onboardingInstrumented: instrumented,
          onboardingWaitDays: wait,
        },
      }),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ["analyticsReportingSettings", projectId],
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
      <label className="grid gap-1 text-sm">
        Project timezone
        <input
          className="input w-full"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="Europe/London"
          required
        />
        <span className="text-xs text-base-content/60">
          IANA timezone. The analytics URL can override this default; stored
          timestamps stay UTC.
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Funnel completion window (days)
          <input
            className="input w-full"
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(e.target.valueAsNumber)}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          Onboarding wait (days)
          <input
            className="input w-full"
            type="number"
            min={1}
            max={90}
            value={wait}
            onChange={(e) => setWait(e.target.valueAsNumber)}
            required
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        Verified onboarding completion event
        <select
          className="select w-full"
          value={event}
          onChange={(e) => setEvent(e.target.value)}
        >
          {analyticsEventNames
            .filter(
              (n) =>
                ![
                  "page_view",
                  "acquisition_clicked",
                  "product_opened",
                  "identity_known",
                ].includes(n),
            )
            .map((n) => (
              <option key={n} value={n}>
                {n.replaceAll("_", " ")}
              </option>
            ))}
        </select>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          className="checkbox checkbox-sm"
          type="checkbox"
          checked={instrumented}
          onChange={(e) => setInstrumented(e.target.checked)}
        />
        Completion instrumentation is installed and verified. Missing events can
        be reported as “No completion observed”; otherwise coverage remains
        unknown.
      </label>
      <button className="btn btn-sm btn-primary" disabled={save.isPending}>
        Save reporting settings
      </button>
      {save.isSuccess && (
        <p role="status" className="text-sm">
          Reporting settings saved.
        </p>
      )}
      {save.isError && (
        <p role="alert" className="text-sm">
          Could not save. Check the timezone, values and administrator
          permission.
        </p>
      )}
    </form>
  );
}
function FunnelSetup({ projectId }: { projectId: string }) {
  const [template, setTemplate] = useState<FunnelTemplate>("external");
  const query = useQuery({
    queryKey: ["analyticsStages", projectId, template],
    queryFn: () => getAnalyticsStages({ data: { projectId, template } }),
  });
  return (
    <section className="space-y-4">
      <h4 className="font-medium">Funnel event mappings</h4>
      <label className="grid gap-1 text-sm">
        Template
        <select
          className="select w-full"
          value={template}
          onChange={(e) =>
            setTemplate(
              z
                .enum(["enquiry", "signup", "external", "sales"])
                .parse(e.target.value),
            )
          }
        >
          {Object.entries(templateLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-base-content/70">
        Map each stage to an observed event. Mark instrumentation only after
        testing it. An external CTA does not prove an install.
      </p>
      {query.data ? (
        <StageForm
          key={template}
          projectId={projectId}
          template={template}
          initial={query.data}
        />
      ) : (
        <p role={query.isError ? "alert" : "status"}>
          {query.isError ? "Could not load stage mappings." : "Loading stages…"}
        </p>
      )}
    </section>
  );
}
function StageForm({
  projectId,
  template,
  initial,
}: {
  projectId: string;
  template: FunnelTemplate;
  initial: FunnelStage[];
}) {
  const [stages, setStages] = useState(initial);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      saveAnalyticsStages({
        data: {
          projectId,
          template,
          stages: stages.map((s) => ({
            ...s,
            event: z.enum(analyticsEventNames).parse(s.event),
          })),
        },
      }),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ["analyticsStages", projectId, template],
      });
    },
  });
  const update = (index: number, patch: Partial<FunnelStage>) =>
    setStages((rows) =>
      rows.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {stages.map((s, i) => (
        <fieldset
          key={s.position}
          className="grid gap-3 rounded border border-base-300 p-3 sm:grid-cols-2"
        >
          <legend className="px-1 text-sm">
            {i + 1}. {s.label}
          </legend>
          <label className="grid gap-1 text-xs">
            Event
            <select
              className="select select-sm w-full"
              value={s.event}
              onChange={(e) => update(i, { event: e.target.value })}
            >
              {analyticsEventNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Required action (optional)
            <input
              className="input input-sm w-full"
              value={s.action ?? ""}
              onChange={(e) => update(i, { action: e.target.value || null })}
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={s.instrumented}
              onChange={(e) => update(i, { instrumented: e.target.checked })}
            />
            Instrumentation verified
          </label>
        </fieldset>
      ))}
      <button className="btn btn-sm btn-primary" disabled={save.isPending}>
        Save stage mappings
      </button>
      {save.isSuccess && (
        <p role="status" className="text-sm">
          Stage mappings saved.
        </p>
      )}
      {save.isError && (
        <p role="alert" className="text-sm">
          Could not save stage mappings.
        </p>
      )}
    </form>
  );
}
