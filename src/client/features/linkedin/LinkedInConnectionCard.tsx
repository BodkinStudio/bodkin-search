import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  disconnectLinkedIn,
  getLinkedInConnection,
  listLinkedInPages,
  setLinkedInPage,
  startLinkedInLink,
} from "@/serverFunctions/linkedin";
export function LinkedInConnectionCard({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const connection = useQuery({
    queryKey: ["linkedin-connection", projectId],
    queryFn: () => getLinkedInConnection({ data: { projectId } }),
  });
  const pages = useQuery({
    queryKey: ["linkedin-pages", projectId],
    enabled: Boolean(connection.data?.currentUserHasGrant),
    queryFn: () => listLinkedInPages({ data: { projectId } }),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["linkedin-connection", projectId] });
  const connect = useMutation({
    mutationFn: async () => {
      const result = await startLinkedInLink({
        data: { callbackURL: window.location.href },
      });
      window.location.assign(result.url);
    },
    onError: (e) =>
      setError(
        e instanceof Error ? e.message : "Could not start LinkedIn connection.",
      ),
  });
  const select = useMutation({
    mutationFn: ({
      accountId,
      pageId,
    }: {
      accountId: string;
      pageId: string;
    }) => setLinkedInPage({ data: { projectId, accountId, pageId } }),
    onSuccess: refresh,
    onError: (e) =>
      setError(e instanceof Error ? e.message : "Could not select that Page."),
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectLinkedIn({ data: { projectId } }),
    onSuccess: refresh,
    onError: (e) =>
      setError(
        e instanceof Error ? e.message : "Could not disconnect LinkedIn.",
      ),
  });
  if (connection.isLoading)
    return (
      <div className="card bg-base-200 p-5" aria-busy="true">
        Loading LinkedIn connection…
      </div>
    );
  return (
    <div
      className="card bg-base-200 p-5 space-y-3"
      aria-busy={connect.isPending || select.isPending || disconnect.isPending}
    >
      <div>
        <h3 className="font-medium">LinkedIn Page analytics</h3>
        <p className="text-sm text-base-content/70">
          Connect one administered company Page for read-only overview
          reporting.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-error">
          {error}
        </p>
      ) : null}
      {connection.data?.connection ? (
        <>
          <p role="status">
            Connected to {connection.data.connection.pageName}.
          </p>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
          >
            Disconnect LinkedIn Page
          </button>
        </>
      ) : connection.data?.currentUserHasGrant ? (
        <div className="space-y-2">
          <p role="status">Choose an administered Page.</p>
          {pages.data?.flatMap((account) =>
            account.pages.map((page) => (
              <button
                type="button"
                className="btn btn-outline btn-sm mr-2"
                key={`${account.accountId}:${page.pageId}`}
                onClick={() =>
                  select.mutate({
                    accountId: account.accountId,
                    pageId: page.pageId,
                  })
                }
                disabled={select.isPending}
              >
                Use {page.pageName}
              </button>
            )),
          )}
          {pages.data?.every((account) => account.pages.length === 0) ? (
            <p role="alert">
              No administered Pages were returned. Confirm that LinkedIn granted
              the requested Page-admin scope.
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => connect.mutate()}
          disabled={connect.isPending}
        >
          Connect LinkedIn
        </button>
      )}
      <p className="text-sm text-base-content/70">
        Manual LinkedIn exports remain available as a fallback and are never
        merged with API data.
      </p>
    </div>
  );
}
