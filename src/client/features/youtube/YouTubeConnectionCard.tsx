/* eslint-disable max-lines -- connection states and accessible picker live together. */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IntegrationConnectionCard } from "@/client/features/integrations/IntegrationConnectionCard";
import { startGoogleLink } from "@/client/features/integrations/startGoogleLink";
import {
  disconnectYouTube,
  getYouTubeConnection,
  listYouTubeChannels,
  setYouTubeChannel,
} from "@/serverFunctions/youtube";
import { GoogleOAuthSetupWarning } from "@/client/features/integrations/GoogleOAuthSetupWarning";
import { YouTubeAnalyticsStatus } from "@/client/features/youtube/YouTubeAnalyticsStatus";
import { unavailableMessage } from "@/client/features/youtube/youtubeConnectionMessages";
import { YOUTUBE_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/youtube";

type Channel = {
  channelId: string;
  title: string;
  customUrl: string | null;
  isSelected: boolean;
};
type Account = {
  accountId: string;
  email: string | null;
  requiresReconnect: boolean;
  unavailable:
    | "forbidden"
    | "quota"
    | "transport"
    | "upstream"
    | "malformed"
    | null;
  channels: Channel[];
};
type Selection = { accountId: string; channelId: string };
export function YouTubeConnectionCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [picking, setPicking] = React.useState(false);
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [message, setMessage] = React.useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const connection = useQuery({
    queryKey: ["youtubeConnection", projectId],
    queryFn: () => getYouTubeConnection({ data: { projectId } }),
  });
  const showPicker =
    picking ||
    Boolean(
      connection.data?.currentUserHasGrant && !connection.data?.connected,
    );
  const channels = useQuery({
    queryKey: ["youtubeChannels", projectId],
    queryFn: () => listYouTubeChannels({ data: { projectId } }),
    enabled: showPicker,
  });
  const accounts = React.useMemo(
    () => channels.data?.accounts ?? [],
    [channels.data?.accounts],
  );

  React.useEffect(() => {
    if (selection) return;
    for (const account of accounts) {
      const selectedChannel = account.channels.find(
        (channel) => channel.isSelected,
      );
      if (selectedChannel) {
        setSelection({
          accountId: account.accountId,
          channelId: selectedChannel.channelId,
        });
        return;
      }
    }
  }, [accounts, selection]);
  const save = useMutation({
    mutationFn: () => {
      const accountId = selection?.accountId ?? "";
      const channelId = selection?.channelId ?? "";
      return setYouTubeChannel({
        data: {
          projectId,
          accountId: accountId ?? "",
          channelId: channelId ?? "",
        },
      });
    },
    onSuccess: async () => {
      setPicking(false);
      setSelection(null);
      setMessage({ kind: "success", text: "YouTube channel connected." });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["youtubeConnection", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["youtubeChannels", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["youtubeAnalytics", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["dashboardActivation", projectId],
        }),
      ]);
    },
    onError: () =>
      setMessage({
        kind: "error",
        text: "Could not save this channel. Check access and try again.",
      }),
  });
  const remove = useMutation({
    mutationFn: () => disconnectYouTube({ data: { projectId } }),
    onSuccess: async () => {
      setPicking(false);
      setMessage({ kind: "success", text: "YouTube channel disconnected." });
      setSelection(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["youtubeConnection", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["youtubeChannels", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["youtubeAnalytics", projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["dashboardActivation", projectId],
        }),
      ]);
    },
    onError: () =>
      setMessage({
        kind: "error",
        text: "Could not disconnect this project's YouTube channel.",
      }),
  });
  const data = connection.data;
  return (
    <IntegrationConnectionCard
      title="YouTube"
      icon={<span aria-hidden="true">▶</span>}
      status={
        connection.isLoading
          ? undefined
          : data && !data.googleOAuthConfigured
            ? "setup_required"
            : data?.connected
              ? "connected"
              : "disconnected"
      }
    >
      <div
        aria-busy={
          connection.isLoading ||
          channels.isLoading ||
          save.isPending ||
          remove.isPending
        }
        className="space-y-3"
      >
        {message ? (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            aria-live={message.kind === "error" ? "assertive" : "polite"}
          >
            {message.text}
          </p>
        ) : null}
        {connection.isLoading ? (
          <p role="status" aria-live="polite">
            Checking YouTube connection…
          </p>
        ) : data?.connected && !picking ? (
          <>
            <p>
              <strong>{data.channelTitle}</strong> ·{" "}
              {data.channelCustomUrl ?? data.channelId}
              {data.connectedByEmail ? ` · ${data.connectedByEmail}` : ""}
            </p>
            <YouTubeAnalyticsStatus
              analyticsReady={data.analyticsReady}
              canReconnect={data.currentUserCanReconnect}
              disabled={remove.isPending}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setMessage(null);
                setPicking(true);
              }}
              disabled={remove.isPending}
            >
              Change channel
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm text-error"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Disconnecting…" : "Disconnect"}
            </button>
          </>
        ) : !data?.googleOAuthConfigured ? (
          <GoogleOAuthSetupWarning
            integrationName="YouTube"
            docsUrl={YOUTUBE_SELF_HOSTED_SETUP_DOCS_URL}
          />
        ) : showPicker ? (
          <Picker
            data={accounts}
            selection={selection}
            setSelection={setSelection}
            loading={channels.isLoading}
            error={channels.isError}
            save={() => save.mutate()}
            saving={save.isPending}
            retry={() => void channels.refetch()}
            connect={() =>
              void startGoogleLink("youtube", window.location.href)
            }
            cancel={() => {
              setPicking(false);
              setSelection(null);
              setMessage(null);
            }}
          />
        ) : (
          <>
            <p className="text-sm">
              Connect a YouTube channel for this project to view read-only
              channel analytics in OpenSEO and MCP.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() =>
                void startGoogleLink("youtube", window.location.href)
              }
            >
              Connect with Google
            </button>
          </>
        )}
      </div>
    </IntegrationConnectionCard>
  );
}
function Picker({
  data,
  selection,
  setSelection,
  loading,
  error,
  save,
  saving,
  retry,
  connect,
  cancel,
}: {
  data: Account[];
  selection: Selection | null;
  setSelection: (selection: Selection | null) => void;
  loading: boolean;
  error: boolean;
  save: () => void;
  saving: boolean;
  retry: () => void;
  connect: () => void;
  cancel: () => void;
}) {
  if (loading)
    return (
      <p role="status" aria-live="polite">
        Loading channels…
      </p>
    );
  if (error)
    return (
      <>
        <p role="alert">Could not load your YouTube channels.</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>
          Try again
        </button>
      </>
    );
  if (data.length && data.every((account) => account.requiresReconnect))
    return (
      <>
        <p role="alert">Connection expired. Reconnect to continue.</p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={connect}
        >
          Reconnect with Google
        </button>
      </>
    );
  const usable = data.filter(
    (account) => !account.requiresReconnect && !account.unavailable,
  );
  const hasUnavailable = data.some((account) => account.unavailable);
  const options = usable.flatMap((account) =>
    account.channels.map((channel) => ({
      accountId: account.accountId,
      channelId: channel.channelId,
    })),
  );
  const selectedIndex = selection
    ? options.findIndex(
        (option) =>
          option.accountId === selection.accountId &&
          option.channelId === selection.channelId,
      )
    : options.findIndex((option) =>
        data.some(
          (account) =>
            account.accountId === option.accountId &&
            account.channels.some(
              (channel) =>
                channel.channelId === option.channelId && channel.isSelected,
            ),
        ),
      );
  return (
    <>
      {hasUnavailable ? (
        <p role="alert" className="text-sm text-warning">
          {unavailableMessage(data)}
        </p>
      ) : null}
      <label htmlFor="youtube-channel" className="block text-sm font-medium">
        YouTube channel
      </label>
      <select
        id="youtube-channel"
        className="select select-bordered w-full max-w-md"
        value={selectedIndex >= 0 ? String(selectedIndex) : ""}
        onChange={(e) => {
          const option = options[Number(e.target.value)];
          setSelection(option ?? null);
        }}
      >
        <option value="" disabled>
          Select a channel…
        </option>
        {usable.map((a) => (
          <optgroup key={a.accountId} label={a.email ?? "Google account"}>
            {a.channels.map((c) => (
              <option
                key={c.channelId}
                value={options.findIndex(
                  (option) =>
                    option.accountId === a.accountId &&
                    option.channelId === c.channelId,
                )}
              >
                {c.title} · {c.customUrl ?? c.channelId}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {options.length === 0 && !hasUnavailable ? (
        <p className="text-sm text-base-content/60">
          No YouTube channels are available for this Google account.
        </p>
      ) : null}
      <div className="flex gap-1">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={selectedIndex < 0 || saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save channel"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={connect}
          disabled={saving}
        >
          Connect another Google account
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={cancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </>
  );
}
