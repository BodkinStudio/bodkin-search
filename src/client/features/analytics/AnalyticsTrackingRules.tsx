import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAnalyticsTrackingRules,
  saveAnalyticsTrackingRules,
} from "@/serverFunctions/analyticsConfiguration";
export function AnalyticsTrackingRules({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["analyticsTrackingRules", projectId],
    queryFn: () => getAnalyticsTrackingRules({ data: { projectId } }),
  });
  return (
    <section className="space-y-4 border-t border-base-300 pt-6">
      <h3 className="font-medium">Actions, exclusions and change history</h3>
      {query.data ? (
        <>
          <RulesForm projectId={projectId} initial={query.data} />
          <details>
            <summary className="cursor-pointer text-sm">
              Configuration audit · last 100 changes
            </summary>
            <ol className="mt-3 space-y-2">
              {query.data.audit.map((a) => (
                <li
                  key={a.id}
                  className="border-b border-base-300 py-2 text-xs"
                >
                  <strong>
                    {a.entity} · {a.field}
                  </strong>
                  <p className="break-all">
                    {a.previousValue ?? "Unset"} → {a.nextValue ?? "Unset"}
                  </p>
                  <p className="text-base-content/60">
                    {a.occurredAt} · {a.actorId}
                    {a.reason ? ` · ${a.reason}` : ""}
                  </p>
                </li>
              ))}
            </ol>
            {!query.data.audit.length && (
              <p className="mt-3 text-sm">
                No configuration changes recorded yet.
              </p>
            )}
          </details>
        </>
      ) : (
        <p role={query.isError ? "alert" : "status"}>
          {query.isError
            ? "Administrator permission is required to inspect and change tracking rules."
            : "Loading tracking rules…"}
        </p>
      )}
    </section>
  );
}
function RulesForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Awaited<ReturnType<typeof getAnalyticsTrackingRules>>;
}) {
  const [actions, setActions] = useState(
    initial.actions.map((a) => `${a.action},${a.destination}`).join("\n"),
  );
  const [paths, setPaths] = useState(
    initial.excludedPaths.map((p) => p.prefix).join("\n"),
  );
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      saveAnalyticsTrackingRules({
        data: {
          projectId,
          actions: actions
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((line) => {
              const [action, destination, ...rest] = line
                .split(",")
                .map((s) => s.trim());
              if (!action || !destination || rest.length)
                throw new Error("Use action,destination on each line");
              return { action, destination };
            }),
          excludedPaths: [
            ...new Set(
              paths
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            ),
          ],
        },
      }),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ["analyticsTrackingRules", projectId],
      });
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label className="grid gap-1 text-sm">
        Allowed acquisition actions
        <textarea
          className="textarea w-full font-mono text-xs"
          rows={4}
          value={actions}
          onChange={(e) => setActions(e.target.value)}
        />
        <span className="text-xs text-base-content/60">
          One action,destination pair per line, such as start_trial,product.
          Removing an action stops accepting future clicks for it.
        </span>
      </label>
      <label className="grid gap-1 text-sm">
        Excluded route prefixes
        <textarea
          className="textarea w-full font-mono text-xs"
          rows={3}
          value={paths}
          onChange={(e) => setPaths(e.target.value)}
          placeholder="/account\n/private"
        />
        <span className="text-xs text-base-content/60">
          The collector discards these paths before storage or identity
          enrichment. Withdrawal remains available. Referrers from registered
          project hosts are treated as internal.
        </span>
      </label>
      <button className="btn btn-primary btn-sm" disabled={save.isPending}>
        Save tracking rules
      </button>
      {save.isSuccess && (
        <p role="status" className="text-sm">
          Tracking rules saved.
        </p>
      )}
      {save.isError && (
        <p role="alert" className="text-sm">
          Could not save. Use unique action,destination pairs and route prefixes
          starting with /.
        </p>
      )}
    </form>
  );
}
