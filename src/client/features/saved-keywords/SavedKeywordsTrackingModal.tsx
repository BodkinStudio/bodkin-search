import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/client/components/Modal";
import { LOCATIONS } from "@/client/features/keywords/locations";
import { formatLocationLabel } from "@/shared/keyword-locations";
import { devicesLabel } from "@/shared/rank-tracking";
import { SavedKeywordsTrackingCost } from "./SavedKeywordsTrackingCost";
import { getRankTrackingConfigSummaries } from "@/serverFunctions/rank-tracking";

type RankTrackingConfig = Awaited<
  ReturnType<typeof getRankTrackingConfigSummaries>
>[number];

export function SavedKeywordsTrackingModal({
  projectId,
  keywords,
  isPending,
  error,
  confirmDisabled = false,
  lockedConfigId,
  onClose,
  onConfirm,
}: {
  projectId: string;
  keywords: string[];
  isPending: boolean;
  error: string | null;
  confirmDisabled?: boolean;
  lockedConfigId: string | null;
  onClose: () => void;
  onConfirm: (configId: string) => void;
}) {
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const configsQuery = useQuery({
    queryKey: ["rankTrackingConfigSummaries", projectId],
    queryFn: () => getRankTrackingConfigSummaries({ data: { projectId } }),
    refetchOnWindowFocus: false,
  });
  const configs = configsQuery.data ?? [];
  const effectiveConfigId = lockedConfigId ?? selectedConfigId;
  const selectedConfig = configs.find(
    (config) => config.id === effectiveConfigId,
  );

  useEffect(() => {
    const activeElement = document.activeElement;
    previousFocusRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const focusable = content.querySelector<HTMLElement>(
      "button:not(:disabled), a[href], input:not(:disabled)",
    );
    (focusable ?? content).focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = [
        ...content.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], input:not(:disabled)",
        ),
      ];
      if (items.length === 0) {
        event.preventDefault();
        content.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    content.addEventListener("keydown", trapFocus);
    return () => content.removeEventListener("keydown", trapFocus);
  }, [configsQuery.isPending, isPending]);

  return (
    <Modal
      maxWidth="max-w-2xl"
      onClose={isPending ? undefined : onClose}
      labelledBy="track-saved-keywords-title"
    >
      <div ref={contentRef} tabIndex={-1} className="space-y-4">
        <div>
          <h3 id="track-saved-keywords-title" className="text-lg font-semibold">
            Add saved keywords to Rank Tracking
          </h3>
          <p className="mt-1 text-sm text-base-content/70">
            Review the selected terms and choose where to track them.
          </p>
        </div>

        <section aria-labelledby="track-saved-keywords-preview">
          <h4 id="track-saved-keywords-preview" className="text-sm font-medium">
            {keywords.length} selected keyword{keywords.length !== 1 ? "s" : ""}
          </h4>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-base-300 bg-base-200/40 p-3 text-sm">
            {keywords.map((keyword) => (
              <li key={keyword}>{keyword}</li>
            ))}
          </ul>
        </section>

        {configsQuery.isPending ? (
          <div
            className="flex items-center gap-2 text-sm text-base-content/70"
            aria-live="polite"
          >
            <Loader2 className="size-4 animate-spin" /> Loading tracking
            configurations…
          </div>
        ) : configsQuery.isError ? (
          <div
            className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error"
            role="alert"
          >
            Could not load Rank Tracking configurations.
            <button
              type="button"
              className="btn btn-link btn-sm ml-1 text-error"
              onClick={() => void configsQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : configs.length === 0 ? (
          <div className="rounded-lg border border-base-300 bg-base-200/40 p-4 text-sm">
            <p className="font-medium">Set up Rank Tracking first</p>
            <p className="mt-1 text-base-content/70">
              Create a tracking configuration for this project before adding
              saved keywords.
            </p>
            <Link
              to="/p/$projectId/rank-tracking"
              params={{ projectId }}
              className="btn btn-primary btn-sm mt-3"
              onClick={onClose}
            >
              Set up Rank Tracking
            </Link>
          </div>
        ) : (
          <fieldset disabled={isPending || lockedConfigId !== null}>
            <legend className="text-sm font-medium">
              Tracking destination
            </legend>
            <p className="mt-1 text-sm text-base-content/70">
              Select a configuration. No destination is selected automatically.
            </p>
            <div className="mt-2 space-y-2">
              {configs.map((config) => (
                <ConfigChoice
                  key={config.id}
                  config={config}
                  checked={config.id === effectiveConfigId}
                  onChange={() => setSelectedConfigId(config.id)}
                />
              ))}
            </div>
          </fieldset>
        )}

        {selectedConfig ? (
          <SavedKeywordsTrackingCost
            config={selectedConfig}
            keywordCount={keywords.length}
          />
        ) : null}

        {error ? (
          <div
            className="flex gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error"
            role="alert"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm gap-1"
            disabled={
              !selectedConfig ||
              isPending ||
              configsQuery.isPending ||
              configsQuery.isError ||
              confirmDisabled
            }
            onClick={() => effectiveConfigId && onConfirm(effectiveConfigId)}
          >
            {isPending ? <Loader2 className="size-3 animate-spin" /> : null}
            {lockedConfigId
              ? "Retry add to Rank Tracking"
              : "Add to Rank Tracking"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConfigChoice({
  config,
  checked,
  onChange,
}: {
  config: RankTrackingConfig;
  checked: boolean;
  onChange: () => void;
}) {
  const targeting = config.locationName
    ? formatLocationLabel(config.locationName, 2)
    : (LOCATIONS[config.locationCode] ?? `Location ${config.locationCode}`);
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-base-300 p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
      <input
        type="radio"
        name="rank-tracking-config"
        className="radio radio-sm mt-0.5"
        checked={checked}
        onChange={onChange}
      />
      <span>
        <span className="block font-medium">{config.domain}</span>
        <span className="block text-sm text-base-content/70">
          {targeting} · {config.languageCode.toUpperCase()} ·{" "}
          {devicesLabel(config.devices)} · Top {config.serpDepth}
        </span>
      </span>
    </label>
  );
}
