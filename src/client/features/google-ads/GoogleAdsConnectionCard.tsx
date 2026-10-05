import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import {
  AdminConnectsIntegrationCard,
  IntegrationConnectionCard,
} from "@/client/features/integrations/IntegrationConnectionCard";
import { startGoogleLink } from "@/client/features/integrations/startGoogleLink";
import { useWorkspaceAccess } from "@/client/features/workspaces/useWorkspaceAccess";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  disconnectGoogleAds,
  getGoogleAdsConnection,
  listGoogleAdsAccounts,
  setGoogleAdsAccount,
} from "@/serverFunctions/googleAds";

const formatCustomerId = (id: string) =>
  `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;

// Google Ads: the Ads account a project reads spend from, for cost per
// qualified lead. Read-only; admins connect, others see a note.
export function GoogleAdsConnectionCard({ projectId }: { projectId: string }) {
  const access = useWorkspaceAccess();
  if (!access.role) return null;
  if (!access.can("configure"))
    return (
      <AdminConnectsIntegrationCard
        title="Google Ads"
        icon={<GoogleGlyph className="size-5" />}
      />
    );
  return <GoogleAdsConnectionFlow projectId={projectId} />;
}

function GoogleAdsConnectionFlow({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [picking, setPicking] = React.useState(false);
  const [choice, setChoice] = React.useState("");
  const connectionKey = ["googleAdsConnection", projectId];
  const connectionQuery = useQuery({
    queryKey: connectionKey,
    queryFn: () => getGoogleAdsConnection({ data: { projectId } }),
  });
  const state = connectionQuery.data;
  const connected = Boolean(state?.connection);
  const showPicker =
    picking || Boolean(state?.currentUserHasGrant && !connected);
  const accountsQuery = useQuery({
    queryKey: ["googleAdsAccounts", projectId],
    queryFn: () => listGoogleAdsAccounts({ data: { projectId } }),
    enabled: showPicker && Boolean(state?.configured),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: connectionKey });
    void queryClient.invalidateQueries({ queryKey: ["analyticsMqls"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const [accountId, customerId] = choice.split("|");
      return setGoogleAdsAccount({
        data: {
          projectId,
          accountId: accountId ?? "",
          customerId: customerId ?? "",
        },
      });
    },
    onSuccess: () => {
      toast.success("Google Ads connected");
      setPicking(false);
      refresh();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectGoogleAds({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Google Ads disconnected");
      setPicking(false);
      setChoice("");
      refresh();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const options = (accountsQuery.data?.accounts ?? []).flatMap((grant) =>
    grant.ads.map((ad) => ({
      value: `${grant.accountId}|${ad.customerId}`,
      label: `${ad.name} (${formatCustomerId(ad.customerId)})`,
      email: grant.email,
    })),
  );
  const problems = (accountsQuery.data?.accounts ?? []).filter(
    (g) => g.error || g.requiresReconnect,
  );

  return (
    <IntegrationConnectionCard
      title="Google Ads"
      icon={<GoogleGlyph className="size-5" />}
      status={
        connectionQuery.isLoading
          ? undefined
          : !state?.configured
            ? "setup_required"
            : connected
              ? "connected"
              : "disconnected"
      }
    >
      {connectionQuery.isLoading ? (
        <p className="text-sm text-base-content/60">Checking…</p>
      ) : !state?.configured ? (
        <p className="text-sm text-base-content/70">
          Google Ads needs a developer token on this deployment
          (GOOGLE_ADS_DEVELOPER_TOKEN) before an account can be connected.
        </p>
      ) : connected && !picking && state.connection ? (
        <div className="space-y-3 text-sm">
          <p>
            <span className="font-medium">{state.connection.customerName}</span>{" "}
            <span className="text-base-content/60">
              {formatCustomerId(state.connection.customerId)} ·{" "}
              {state.connection.currencyCode} · {state.connection.timeZone}
            </span>
          </p>
          {state.connection.connectedAccountEmail ? (
            <p className="text-base-content/60">
              Connected with {state.connection.connectedAccountEmail}
            </p>
          ) : null}
          <p className="text-base-content/70">
            Spend is read per campaign and shown as cost per qualified lead in
            Analytics.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setPicking(true)}
            >
              Change account
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost text-error"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : showPicker ? (
        <div className="space-y-3 text-sm">
          {accountsQuery.isLoading ? (
            <p className="text-base-content/60">
              Finding your Google Ads accounts…
            </p>
          ) : options.length === 0 ? (
            <p className="text-base-content/70">
              No Google Ads accounts were found for the signed-in Google
              account.
            </p>
          ) : (
            <label className="grid gap-1">
              Google Ads account
              <select
                className="select w-full"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
              >
                <option value="">Choose an account</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                    {o.email ? ` · ${o.email}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {problems.map((p) => (
            <p key={p.accountId} role="alert" className="text-warning">
              {p.requiresReconnect
                ? "A Google sign-in has expired: connect again."
                : p.error}
            </p>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!choice || save.isPending}
              onClick={() => save.mutate()}
            >
              Use this account
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void startGoogleLink("ads", window.location.href)}
            >
              Sign in with another Google account
            </button>
            {connected ? (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setPicking(false)}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-base-content/70">
            Connect Google Ads to see what each campaign costs and its cost per
            qualified lead. Bodkin Search only reads your account; it never
            changes campaigns.
          </p>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => void startGoogleLink("ads", window.location.href)}
          >
            Connect Google Ads
          </button>
        </div>
      )}
    </IntegrationConnectionCard>
  );
}
