/* eslint-disable max-lines -- verifies the connection card's stateful UI in one fixture. */
import { createElement, type ReactNode } from "react";
import type * as ReactModule from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  data?: unknown;
  isLoading?: boolean;
  isError?: boolean;
  refetch?: ReturnType<typeof vi.fn>;
};
function isCallback(value: unknown): value is () => unknown {
  return typeof value === "function";
}
function isStateUpdater(
  value: unknown,
): value is (previous: unknown) => unknown {
  return typeof value === "function";
}
function callback(
  mutation: Record<string, unknown> | undefined,
  name: "mutationFn" | "onSuccess" | "onError",
) {
  const value = mutation?.[name];
  if (!isCallback(value)) throw new Error(`Missing mutation ${name}`);
  return value;
}
const state = vi.hoisted(() => ({
  queries: [] as QueryResult[],
  mutations: [] as Array<Record<string, unknown>>,
  hookIndex: 0,
  mutationHookIndex: 0,
  pendingMutationIndex: null as number | null,
  stateValues: [] as unknown[],
  invalidations: vi.fn(),
  startGoogleLink: vi.fn(),
  setYouTubeChannel: vi.fn(),
  disconnectYouTube: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof ReactModule>();
  return {
    ...react,
    useState: (initial: unknown) => {
      const index = state.hookIndex++;
      if (index >= state.stateValues.length) {
        state.stateValues[index] = isCallback(initial) ? initial() : initial;
      }
      return [
        state.stateValues[index],
        (next: unknown) => {
          state.stateValues[index] = isStateUpdater(next)
            ? next(state.stateValues[index])
            : next;
        },
      ];
    },
    useEffect: (effect: () => void) => effect(),
  };
});
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => state.queries.shift() ?? {},
  useQueryClient: () => ({ invalidateQueries: state.invalidations }),
  useMutation: (options: Record<string, unknown>) => {
    state.mutations.push(options);
    const index = state.mutationHookIndex++;
    return {
      isPending: state.pendingMutationIndex === index,
      mutate: vi.fn(),
    };
  },
}));
vi.mock("@/client/features/integrations/IntegrationConnectionCard", () => ({
  IntegrationConnectionCard: ({
    children,
    status,
    title,
  }: {
    children: ReactNode;
    status?: string;
    title: string;
  }) =>
    createElement(
      "section",
      { "data-status": status, "data-title": title },
      children,
    ),
}));
vi.mock("@/client/features/integrations/startGoogleLink", () => ({
  startGoogleLink: state.startGoogleLink,
}));
vi.mock("@/serverFunctions/youtube", () => ({
  getYouTubeConnection: vi.fn(),
  listYouTubeChannels: vi.fn(),
  setYouTubeChannel: state.setYouTubeChannel,
  disconnectYouTube: state.disconnectYouTube,
}));

const { YouTubeConnectionCard } = await import("./YouTubeConnectionCard");

const channelAccounts = [
  {
    accountId: "account-1",
    email: "owner@example.com",
    requiresReconnect: false,
    unavailable: null,
    channels: [
      {
        channelId: "channel-1",
        title: "Studio Channel",
        customUrl: "@studio",
        isSelected: true,
      },
    ],
  },
  {
    accountId: "account-2",
    email: "second@example.com",
    requiresReconnect: false,
    unavailable: null,
    channels: [
      {
        channelId: "channel-2",
        title: "Second Channel",
        customUrl: null,
        isSelected: false,
      },
    ],
  },
];

function render(connection: QueryResult, channels: QueryResult = {}) {
  state.queries = [connection, channels];
  state.hookIndex = 0;
  state.mutationHookIndex = 0;
  return renderToStaticMarkup(
    createElement(YouTubeConnectionCard, { projectId: "project-1" }),
  );
}

beforeEach(() => {
  state.queries = [];
  state.mutations = [];
  state.hookIndex = 0;
  state.mutationHookIndex = 0;
  state.pendingMutationIndex = null;
  state.stateValues = [];
  state.invalidations.mockReset();
  state.startGoogleLink.mockReset();
  state.setYouTubeChannel.mockReset();
  state.disconnectYouTube.mockReset();
});

describe("YouTubeConnectionCard", () => {
  it("renders checking, setup, and no-grant states with accurate analytics copy", () => {
    expect(render({ isLoading: true })).toContain(
      "Checking YouTube connection",
    );
    const setup = render({ data: { googleOAuthConfigured: false } });
    expect(setup).toContain('data-status="setup_required"');
    expect(setup).toContain("Google OAuth client not configured");
    const noGrant = render({
      data: {
        googleOAuthConfigured: true,
        connected: false,
        currentUserHasGrant: false,
      },
    });
    expect(noGrant).toContain("Connect with Google");
    expect(noGrant).toContain("view read-only channel analytics");
  });

  it("renders a labelled native picker with account optgroups and preselects the saved channel", () => {
    const markup = render(
      {
        data: {
          googleOAuthConfigured: true,
          connected: false,
          currentUserHasGrant: true,
        },
      },
      { data: { accounts: channelAccounts } },
    );

    expect(markup).toContain('<label for="youtube-channel"');
    expect(markup).toContain('<select id="youtube-channel"');
    expect(markup).toContain('<optgroup label="owner@example.com"');
    expect(markup).toContain('<optgroup label="second@example.com"');
    expect(markup).toContain('value="0" selected=""');
    expect(markup).toContain("Save channel");
    expect(markup).toContain("Connect another Google account");
    expect(markup).toContain("Cancel");
  });

  it("asks an older grant to reconnect before analytics can run", () => {
    const markup = render({
      data: {
        googleOAuthConfigured: true,
        connected: true,
        analyticsReady: false,
        currentUserCanReconnect: true,
        channelTitle: "Studio Channel",
        channelCustomUrl: "@studio",
        channelId: "channel-1",
      },
    });
    expect(markup).toContain("Reconnect with Google");
    expect(markup).toContain("enable YouTube Analytics reporting");
  });

  it("does not offer an ineffective reconnect for another member's grant", () => {
    const markup = render({
      data: {
        googleOAuthConfigured: true,
        connected: true,
        analyticsReady: false,
        currentUserCanReconnect: false,
        channelTitle: "Studio Channel",
        channelCustomUrl: "@studio",
        channelId: "channel-1",
      },
    });
    expect(markup).toContain("Ask the person who connected this channel");
    expect(markup).not.toContain(">Reconnect with Google<");
    expect(markup).toContain("Change channel");
  });

  it("submits the saved-channel preselection after the effect-driven rerender", async () => {
    const connection = {
      data: {
        googleOAuthConfigured: true,
        connected: false,
        currentUserHasGrant: true,
      },
    };
    render(connection, { data: { accounts: channelAccounts } });
    render(connection, { data: { accounts: channelAccounts } });
    const save = state.mutations.at(-2);

    await Promise.resolve(callback(save, "mutationFn")());

    expect(state.setYouTubeChannel).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        accountId: "account-1",
        channelId: "channel-1",
      },
    });
  });

  it("renders loading, no-channel, partial-unavailable, expired, and load-error picker feedback", () => {
    const connection = {
      data: {
        googleOAuthConfigured: true,
        connected: false,
        currentUserHasGrant: true,
      },
    };
    expect(render(connection, { isLoading: true })).toContain(
      "Loading channels",
    );
    expect(render(connection, { data: { accounts: [] } })).toContain(
      "No YouTube channels are available",
    );
    for (const [unavailable, message] of [
      ["quota", "quota or rate limit"],
      ["forbidden", "YouTube Data API is enabled"],
      ["malformed", "invalid channel response"],
      ["transport", "temporarily unavailable"],
    ] as const) {
      expect(
        render(connection, {
          data: {
            accounts: [{ ...channelAccounts[0], unavailable, channels: [] }],
          },
        }),
      ).toContain(message);
    }
    expect(
      render(connection, {
        data: {
          accounts: [{ ...channelAccounts[0], requiresReconnect: true }],
        },
      }),
    ).toContain("Reconnect with Google");
    const loadError = render(connection, { isError: true });
    expect(loadError).toContain('role="alert"');
    expect(loadError).toContain("Try again");
  });

  it("announces busy connection work and shows connected project-scoped disconnect copy", () => {
    const checking = render({ isLoading: true });
    expect(checking).toContain('role="status"');
    expect(checking).toContain('aria-busy="true"');
    const connected = render({
      data: {
        googleOAuthConfigured: true,
        connected: true,
        analyticsReady: true,
        channelTitle: "Studio Channel",
        channelCustomUrl: "@studio",
        channelId: "channel-1",
        connectedByEmail: "owner@example.com",
      },
    });
    expect(connected).toContain("Studio Channel");
    expect(connected).toContain("@studio");
    expect(connected).toContain("owner@example.com");
    expect(connected).toContain("Change channel");
    expect(connected).toContain("Disconnect");
  });

  it("disables every picker action while saving and connected actions while disconnecting", () => {
    const pickerConnection = {
      data: {
        googleOAuthConfigured: true,
        connected: false,
        currentUserHasGrant: true,
      },
    };
    state.pendingMutationIndex = 0;
    const saving = render(pickerConnection, {
      data: { accounts: channelAccounts },
    });
    expect(saving).toContain("Saving…");
    expect(saving).toContain('disabled=""');
    expect(saving.match(/<button[^>]*disabled=""/g)).toHaveLength(3);

    state.pendingMutationIndex = 1;
    const disconnecting = render({
      data: {
        googleOAuthConfigured: true,
        connected: true,
        analyticsReady: true,
        channelTitle: "Studio Channel",
        channelCustomUrl: "@studio",
        channelId: "channel-1",
      },
    });
    expect(disconnecting).toContain("Disconnecting…");
    expect(disconnecting.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });

  it("wires successful mutations to project-scoped invalidation", async () => {
    render(
      {
        data: {
          googleOAuthConfigured: true,
          connected: false,
          currentUserHasGrant: true,
        },
      },
      { data: { accounts: channelAccounts } },
    );
    const save = state.mutations[0];
    const remove = state.mutations[1];

    let resolveConnection: (() => void) | undefined;
    let resolveChannels: (() => void) | undefined;
    state.invalidations
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveConnection = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveChannels = resolve;
          }),
      );
    let saveFinished = false;
    const saveSuccess = Promise.resolve(callback(save, "onSuccess")()).then(
      () => {
        saveFinished = true;
      },
    );
    await Promise.resolve();
    expect(saveFinished).toBe(false);
    resolveConnection?.();
    await Promise.resolve();
    expect(saveFinished).toBe(false);
    resolveChannels?.();
    await saveSuccess;
    await Promise.resolve(callback(remove, "mutationFn")());
    expect(state.disconnectYouTube).toHaveBeenCalledWith({
      data: { projectId: "project-1" },
    });
    await Promise.resolve(callback(remove, "onSuccess")());

    expect(state.invalidations).toHaveBeenCalledWith({
      queryKey: ["youtubeConnection", "project-1"],
    });
    expect(state.invalidations).toHaveBeenCalledWith({
      queryKey: ["youtubeChannels", "project-1"],
    });
    expect(state.invalidations).toHaveBeenCalledWith({
      queryKey: ["youtubeAnalytics", "project-1"],
    });
  });

  it("renders local save and disconnect errors as alerts after a callback-driven rerender", () => {
    const connection = {
      data: {
        googleOAuthConfigured: true,
        connected: false,
        currentUserHasGrant: true,
      },
    };
    render(connection, { data: { accounts: channelAccounts } });
    const save = state.mutations[0];
    callback(save, "onError")();
    const saveError = render(connection, {
      data: { accounts: channelAccounts },
    });
    expect(saveError).toContain('role="alert"');
    expect(saveError).toContain("Could not save this channel");

    state.stateValues = [];
    state.mutations = [];
    render({
      data: {
        googleOAuthConfigured: true,
        connected: true,
        channelTitle: "Studio Channel",
        channelCustomUrl: null,
        channelId: "channel-1",
      },
    });
    const remove = state.mutations[1];
    callback(remove, "onError")();
    const disconnectError = render({
      data: {
        googleOAuthConfigured: true,
        connected: true,
        channelTitle: "Studio Channel",
        channelCustomUrl: null,
        channelId: "channel-1",
      },
    });
    expect(disconnectError).toContain('role="alert"');
    expect(disconnectError).toContain("Could not disconnect this project");
  });
});
