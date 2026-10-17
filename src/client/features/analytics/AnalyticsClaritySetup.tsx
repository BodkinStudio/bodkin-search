import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getClarityConnection,
  removeClarityConnection,
  saveClarityConnection,
} from "@/serverFunctions/analytics";

type Connection = Awaited<ReturnType<typeof getClarityConnection>>;

// Microsoft Clarity for this project: its Clarity project and Data Export
// token. The token is write-only here; it is stored encrypted and never read
// back to the browser.
export function AnalyticsClaritySetup({ projectId }: { projectId: string }) {
  const connection = useQuery({
    queryKey: ["clarityConnection", projectId],
    queryFn: () => getClarityConnection({ data: { projectId } }),
  });
  return (
    <section className="border-t border-base-300 pt-6">
      <h3 className="mb-1 font-medium">Microsoft Clarity</h3>
      <p className="mb-4 max-w-3xl text-sm text-base-content/70">
        Adds what Clarity measured on each page (scroll depth, rage clicks, dead
        clicks) to Where visits end. Clarity only keeps this for three days, so
        a snapshot is taken once a day from the day you connect.
      </p>
      {connection.isPending ? (
        <p role="status">Loading the Clarity connection…</p>
      ) : connection.isError ? (
        <p role="alert" className="text-sm">
          Only an analytics administrator can connect Clarity.
        </p>
      ) : (
        <ClarityForm projectId={projectId} connection={connection.data} />
      )}
    </section>
  );
}

function ClarityForm({
  projectId,
  connection,
}: {
  projectId: string;
  connection: Connection;
}) {
  const [clarityProjectId, setClarityProjectId] = useState(
    connection?.clarityProjectId ?? "",
  );
  const [token, setToken] = useState("");
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["clarityConnection", projectId],
    });
  const save = useMutation({
    mutationFn: () =>
      saveClarityConnection({
        data: { projectId, clarityProjectId: clarityProjectId.trim(), token },
      }),
    onSuccess: () => {
      setToken("");
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => removeClarityConnection({ data: { projectId } }),
    onSuccess: refresh,
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {connection ? (
        <p className="text-sm">
          Connected to Clarity project{" "}
          <span className="font-medium">{connection.clarityProjectId}</span>.{" "}
          {connection.lastSyncError ? (
            <span className="text-error">
              The last snapshot failed: {connection.lastSyncError}
            </span>
          ) : connection.lastSyncedAt ? (
            <>
              Last snapshot {new Date(connection.lastSyncedAt).toLocaleString()}
              .
            </>
          ) : (
            "No snapshot yet; the first is taken overnight."
          )}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          Clarity project ID
          <input
            className="input w-full"
            required
            pattern="[a-z0-9]{6,20}"
            autoComplete="off"
            value={clarityProjectId}
            onChange={(e) => setClarityProjectId(e.target.value)}
          />
          <span className="text-xs text-base-content/70">
            The part after /projects/view/ in Clarity’s address bar, for the
            project your site reports to.
          </span>
        </label>
        <label className="grid gap-1 text-sm">
          Data Export token
          <input
            className="input w-full"
            type="password"
            required
            minLength={20}
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <span className="text-xs text-base-content/70">
            Create it in that Clarity project under Settings, Data Export. It is
            stored encrypted and never shown again.
          </span>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm btn-primary" disabled={save.isPending}>
          {connection ? "Replace token" : "Connect Clarity"}
        </button>
        {connection ? (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Disconnect
          </button>
        ) : null}
      </div>
      {save.isSuccess && (
        <p role="status" className="text-sm">
          Clarity connected.
          {save.data.warning ? (
            <span className="mt-1 block text-warning">{save.data.warning}</span>
          ) : null}
        </p>
      )}
      {save.isError && (
        <p role="alert" className="text-sm text-error">
          Could not connect. Check the project ID and token, and that this
          deployment has its analytics secrets configured.
        </p>
      )}
      {remove.isSuccess && (
        <p role="status" className="text-sm">
          Disconnected. Snapshots already taken are kept.
        </p>
      )}
    </form>
  );
}
