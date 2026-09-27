import { AnalyticsReportingSetup } from "./AnalyticsReportingSetup";
import { AnalyticsTrackingRules } from "./AnalyticsTrackingRules";
import { AnalyticsPrivacyControls } from "./AnalyticsPrivacyControls";
import { AnalyticsNetworkTest } from "./AnalyticsNetworkTest";
import { AnalyticsConfiguration } from "./AnalyticsConfiguration";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAnalyticsSource,
  listAnalyticsSources,
} from "@/serverFunctions/analytics";
function AnalyticsInstall({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [hostname, setHostname] = useState("");
  const [kind, setKind] = useState<"website" | "product" | "integration">(
    "website",
  );
  const [environment, setEnvironment] = useState<"production" | "test">("test");
  const sources = useQuery({
    queryKey: ["analyticsSources", projectId],
    queryFn: () => listAnalyticsSources({ data: { projectId } }),
  });
  const create = useMutation({
    mutationFn: () =>
      createAnalyticsSource({
        data: { projectId, hostname, kind, environment },
      }),
    onSuccess: () => {
      setHostname("");
      void queryClient.invalidateQueries({
        queryKey: ["analyticsSources", projectId],
      });
    },
  });
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://your-bodkin-host";
  return (
    <div className="space-y-8">
      {sources.data?.length === 0 ? (
        <ol className="list-decimal space-y-1 rounded-lg border border-base-300 bg-base-200/50 py-4 pr-4 pl-9 text-sm">
          <li>Add your site below. Start with a test source.</li>
          <li>
            Paste the snippet into your site and add the collector to your
            content security policy.
          </li>
          <li>
            Visit your site, allow analytics, and check Measurement &rarr;
            Tracking health for the event.
          </li>
          <li>When test events arrive, add a production source.</li>
        </ol>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <h3 className="font-medium">Add a source</h3>
        <label className="grid gap-1 text-sm">
          Hostname
          <input
            className="input w-full"
            placeholder="www.example.com"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            required
            pattern="[a-zA-Z0-9.-]+"
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1 text-sm">
            Surface
            <select
              className="select w-full"
              value={kind}
              onChange={(e) =>
                setKind(
                  e.target.value === "product"
                    ? "product"
                    : e.target.value === "integration"
                      ? "integration"
                      : "website",
                )
              }
            >
              <option value="website">Website</option>
              <option value="product">Product</option>
              <option value="integration">Server integration</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Environment
            <select
              className="select w-full"
              value={environment}
              onChange={(e) =>
                setEnvironment(
                  e.target.value === "production" ? "production" : "test",
                )
              }
            >
              <option value="test">Test first</option>
              <option value="production">Production</option>
            </select>
          </label>
        </div>
        <button className="btn btn-primary btn-sm" disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Register source"}
        </button>
        {create.isError && (
          <p role="alert" className="text-sm text-error">
            Could not register this source. Check the hostname and whether it
            already exists.
          </p>
        )}
        {create.isSuccess && (
          <p role="status" className="text-sm">
            Source registered. Install the tracker and grant permission to send
            a test event.
          </p>
        )}
      </form>
      <section className="space-y-4">
        <h3 className="font-medium">Registered sources</h3>
        {sources.isPending ? (
          <p role="status">Loading sources…</p>
        ) : sources.isError ? (
          <p role="alert">Unable to load sources.</p>
        ) : sources.data.length === 0 ? (
          <p className="text-sm text-base-content/70">
            No sources registered yet.
          </p>
        ) : (
          sources.data.map((source) => (
            <details
              key={source.id}
              className="rounded-lg border border-base-300"
            >
              <summary className="cursor-pointer p-4 text-sm font-medium">
                {source.hostname}{" "}
                <span className="ml-2 font-normal text-base-content/60">
                  {source.kind} · {source.environment}
                </span>
              </summary>
              <div className="space-y-4 border-t border-base-300 p-4 text-sm">
                <p>
                  Public source key; it routes telemetry and cannot verify
                  identity or outcomes.
                </p>
                <pre className="overflow-x-auto rounded bg-base-200 p-3 text-xs">{`<script async src="${origin}/bodkin-journeys.js"></script>\n\n// Run after the script loads. Use your real consent adapter.\nconst tracker = BodkinJourneys.initJourneyTracker({\n  projectKey: "${source.publicKey}",\n  sourceId: "${source.id}",\n  environment: "${source.environment}",\n  collectorUrl: "${origin}/api/analytics/collect",\n  consent: yourExistingConsentAdapter\n});`}</pre>
                <p>
                  Your adapter supplies <code>getState()</code> and{" "}
                  <code>subscribe(listener)</code>. Return separate analytics,
                  attribution and identity permissions plus your policyVersion.
                  Unknown or denied permission must return false.
                </p>
                <pre className="overflow-x-auto rounded bg-base-200 p-3 text-xs">{`<a href="https://your-product.example/"\n   data-bodkin-event="acquisition_clicked"\n   data-bodkin-action="start_trial"\n   data-bodkin-destination="product">Start trial</a>`}</pre>
              </div>
            </details>
          ))
        )}
      </section>
      <section className="space-y-3 border-t border-base-300 pt-6">
        <h3 className="font-medium">CSP and transport</h3>
        <p className="text-sm text-base-content/70">
          Add the collector origin to your existing policy. Keep your other
          directives. The collector accepts only registered source origins and
          does not use third-party cookies.
        </p>
        <pre className="overflow-x-auto rounded bg-base-200 p-3 text-xs">{`script-src … ${origin};\nconnect-src … ${origin};`}</pre>
        <p className="text-sm text-base-content/70">
          Exclude this endpoint from instrumentation that injects unsupported
          headers. Do not disable browser security. Verify the website and
          actual product context against the same collector.
        </p>
      </section>
    </div>
  );
}

const SETUP_SECTIONS = [
  { value: "install", label: "Install" },
  { value: "measurement", label: "Measurement" },
  { value: "reporting", label: "Reporting" },
  { value: "privacy", label: "Privacy" },
] as const;
export type AnalyticsSetupSection = (typeof SETUP_SECTIONS)[number]["value"];

// Tracking setup in four parts instead of one long page: getting the tracker
// onto the site first, then what is measured, how it is reported, and
// privacy controls.
export function AnalyticsSetup({
  projectId,
  section,
  onSection,
}: {
  projectId: string;
  section: AnalyticsSetupSection;
  onSection: (section: AnalyticsSetupSection) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Journey tracking</h2>
        <p className="mt-1 text-sm text-base-content/70">
          Register the website and product surfaces you control. Tracking waits
          for your existing consent mechanism; no extra customer login is
          needed.
        </p>
      </div>
      <nav
        aria-label="Tracking setup sections"
        className="max-w-full overflow-x-auto"
      >
        <div className="join">
          {SETUP_SECTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-current={section === item.value ? "page" : undefined}
              className={`btn btn-sm join-item ${section === item.value ? "btn-neutral" : "btn-ghost border-base-300"}`}
              onClick={() => onSection(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>
      {section === "install" ? (
        <AnalyticsInstall projectId={projectId} />
      ) : null}
      {section === "measurement" ? (
        <>
          <AnalyticsConfiguration projectId={projectId} />
          <AnalyticsNetworkTest projectId={projectId} />
        </>
      ) : null}
      {section === "reporting" ? (
        <>
          <AnalyticsReportingSetup projectId={projectId} />
          <AnalyticsTrackingRules projectId={projectId} />
        </>
      ) : null}
      {section === "privacy" ? (
        <AnalyticsPrivacyControls projectId={projectId} />
      ) : null}
    </div>
  );
}
