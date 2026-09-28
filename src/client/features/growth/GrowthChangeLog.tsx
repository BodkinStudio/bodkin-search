import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getGrowthChangeLog,
  recordGrowthPageChange,
} from "@/serverFunctions/growthChangeLog";
import type { RecordGrowthPageChangeInput } from "@/types/schemas/growth-change-log";
import { GrowthChangeForm, type GrowthChangeDraft } from "./GrowthChangeForm";
import { GrowthChangeHistory } from "./GrowthChangeHistory";
import { formatGrowthPreviewDate } from "./GrowthPreviewPresentation";

export function GrowthChangeLog({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const queryKey = ["growthChangeLog", projectId];
  const [open, setOpen] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [submitted, setSubmitted] =
    useState<RecordGrowthPageChangeInput | null>(null);
  const [savedDate, setSavedDate] = useState<string | null>(null);
  const dispatching = useRef(false);
  const query = useQuery({
    queryKey,
    queryFn: () => getGrowthChangeLog({ data: { projectId } }),
    retry: false,
  });
  const save = useMutation({
    mutationFn: (data: RecordGrowthPageChangeInput) =>
      recordGrowthPageChange({ data }),
    retry: false,
    onMutate: () => client.cancelQueries({ queryKey }),
    onSuccess: (change) => {
      client.setQueryData<Awaited<ReturnType<typeof getGrowthChangeLog>>>(
        queryKey,
        (current) => {
          if (!current) return current;
          return {
            ...current,
            changes: [
              change,
              ...current.changes.filter((item) => item.id !== change.id),
            ]
              .toSorted(
                (a, b) =>
                  b.happenedAt.localeCompare(a.happenedAt) ||
                  b.id.localeCompare(a.id),
              )
              .slice(0, current.limit),
          };
        },
      );
      setSavedDate(change.happenedAt);
      setSubmitted(null);
      setFormVersion((value) => value + 1);
      setOpen(false);
    },
    onSettled: () => {
      dispatching.current = false;
      void client.invalidateQueries({ queryKey });
    },
  });
  const submit = (draft: GrowthChangeDraft) => {
    if (submitted || dispatching.current) return;
    const request = {
      ...draft,
      description: draft.description.trim(),
      projectId,
      requestKey: crypto.randomUUID(),
    };
    dispatching.current = true;
    setSavedDate(null);
    setSubmitted(request);
    save.mutate(request);
  };

  return (
    <section
      id="growth-change-log"
      aria-labelledby="growth-change-log-title"
      className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="growth-change-log-title" className="text-lg font-semibold">
            Change log
          </h2>
          <p className="mt-1 max-w-prose text-sm text-base-content/70">
            Keep a record of work on priority pages, alongside the evidence you
            review.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={query.isFetching || save.isPending}
          onClick={() => void query.refetch()}
        >
          {query.isFetching
            ? "Refreshing saved changes…"
            : "Refresh saved changes"}
        </button>
      </div>
      {query.isPending ? (
        <p role="status" aria-busy="true" className="mt-4 text-sm">
          Loading saved changes…
        </p>
      ) : null}
      {query.isError ? (
        <p
          role="alert"
          className="mt-4 text-sm text-[color:color-mix(in_oklch,var(--color-error),var(--color-base-content)_35%)]"
        >
          Saved changes could not be refreshed. Use Refresh saved changes to try
          again.
        </p>
      ) : null}
      {savedDate ? (
        <p role="status" className="mt-4 text-sm">
          Change saved for {formatGrowthPreviewDate(savedDate)} (UTC). Older
          entries may fall outside the latest 50 shown below.
        </p>
      ) : null}
      {save.isError && submitted ? (
        <div role="alert" className="alert alert-error mt-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p>
              {getStandardErrorMessage(
                save.error,
                "The save could not be confirmed.",
              )}
            </p>
            <p className="mt-1 text-sm">
              Check saved changes before starting another entry. Retry save
              keeps these submitted details unchanged. If you leave or reload,
              check the history before recording this work again.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              disabled={save.isPending}
              onClick={() => {
                if (dispatching.current) return;
                dispatching.current = true;
                save.mutate(submitted);
              }}
            >
              Retry save
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={save.isPending}
              onClick={() => {
                setSubmitted(null);
                setFormVersion((value) => value + 1);
                save.reset();
                setOpen(true);
              }}
            >
              Start a separate entry
            </button>
          </div>
        </div>
      ) : null}
      {query.data ? (
        <>
          {query.data.setup !== "ready" ? (
            <p className="mt-4 text-sm">
              {query.data.setup === "missing_domain"
                ? "Set a project domain"
                : "Add a key page"}{" "}
              before recording changes.{" "}
              <Link
                className="link"
                to={
                  query.data.setup === "missing_domain"
                    ? "/p/$projectId/settings"
                    : "/p/$projectId/settings/context"
                }
                params={{ projectId }}
              >
                Open project settings
              </Link>
              .
            </p>
          ) : null}
          {query.data.setup === "ready" || submitted ? (
            <details
              open={open}
              onToggle={(event) => setOpen(event.currentTarget.open)}
              className="mt-4 border-y border-base-300 py-3"
            >
              <summary className="cursor-pointer text-sm font-medium">
                Record a change
              </summary>
              <GrowthChangeForm
                key={formVersion}
                keyPages={query.data.keyPages}
                disabled={Boolean(submitted)}
                pending={save.isPending}
                onSubmit={submit}
              />
            </details>
          ) : null}
          <GrowthChangeHistory
            changes={query.data.changes}
            limit={query.data.limit}
          />
        </>
      ) : null}
    </section>
  );
}
