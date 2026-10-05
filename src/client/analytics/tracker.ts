import { campaignFrom, clickIdFrom } from "./url-tags";
/** Consent-first browser tracker. Import as a module or use the async script build. */
export interface JourneyConsent {
  analytics: boolean;
  attribution: boolean;
  identity: boolean;
  policyVersion: string;
}
export interface JourneyTrackerOptions {
  projectKey: string;
  sourceId: string;
  collectorUrl: string;
  environment?: "production" | "test";
  consent: {
    getState(): JourneyConsent;
    subscribe(listener: (state: JourneyConsent) => void): () => void;
  };
  /** Map dynamic URLs to safe routes. Returning null excludes the page. */
  route?: (url: URL) => string | null;
  hashRoutes?: boolean;
  /** Count visitors without analytics consent, storing nothing on the device. */
  anonymous?: boolean;
}
type EventProperties = {
  action?: string;
  destination?: string;
  placement?: string;
};
type BrowserEvent = {
  schemaVersion: 1;
  eventId: string;
  projectKey: string;
  sourceId: string;
  environment: "production" | "test";
  mode?: "anonymous";
  contextId?: string;
  sessionId?: string;
  occurredAt: string;
  name: string;
  consent: JourneyConsent;
  page?: { host: string; path: string };
  referrer?: { host: string; path: string };
  campaign?: Record<string, string>;
  clickId?: { type: string; value: string };
  properties?: EventProperties;
  identityAssertion?: string;
};
export interface JourneyTracker {
  track(
    name: "acquisition_clicked" | "product_opened",
    properties?: EventProperties,
  ): void;
  identify(assertion: string): void;
  getContextId(): string | null;
  reset(): void;
  flush(): Promise<void>;
  destroy(): void;
}
const trackers = new Map<string, JourneyTracker>();
const lastNavigation = new Map<
  string,
  { page: string; contextId: string | null }
>();
const lifetime = 90 * 86400_000;
const sessionLifetime = 30 * 60_000;
const denied: JourneyConsent = {
  analytics: false,
  attribution: false,
  identity: false,
  policyVersion: "unknown",
};

// Emails, 4+ digit runs, 16+ hex runs and 32+ character tokens, except
// readable lowercase hyphenated slugs, which stay however long.
const unsafe = /@|\d{4,}|[a-fA-F0-9]{16,}|^(?![a-z]+(-[a-z]+)+$).*[\w-]{32,}/;
/** Drops queries/fragments and identifying segments. Mirrors safeAnalyticsPath. */
export function safeJourneyPath(path: string): string {
  return path
    .split(/[?#]/)[0]
    .split("/")
    .map((segment) => {
      let decoded: string;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return ":redacted";
      }
      return unsafe.test(decoded) ? ":redacted" : segment;
    })
    .join("/")
    .slice(0, 500);
}

const optedOut = () =>
  navigator.doNotTrack === "1" ||
  ("globalPrivacyControl" in navigator &&
    navigator.globalPrivacyControl === true);
const noop = () => {};

export function initJourneyTracker(
  options: JourneyTrackerOptions,
): JourneyTracker {
  const key = `${options.projectKey}:${options.sourceId}:${options.environment ?? "production"}`;
  const existing = trackers.get(key);
  if (existing) return existing;
  const storageKey = `bodkin-journey:${key}`;
  let consent = denied;
  let contextId: string | null = null;
  let sessionId = "";
  let lastActivity = 0;
  let createdAt = 0;
  let lastPage = "";
  let queue: BrowserEvent[] = [];
  let sending = false;
  let stopped = false;
  let generation = 0;
  let lastAction = "";
  let lastActionAt = 0;
  const mode = () => {
    if (stopped || optedOut()) return null;
    if (consent.analytics) return "consented";
    return options.anonymous ? "anonymous" : null;
  };
  const allowed = () => mode() !== null;
  const clear = () => {
    generation++;
    queue = [];
    contextId = null;
    sessionId = "";
    lastPage = "";
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* Memory-only host. */
    }
  };
  const persist = () => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ contextId, sessionId, lastActivity, createdAt }),
      );
    } catch {
      /* Memory-only host. */
    }
  };
  const ensureContext = () => {
    if (mode() !== "consented") return false;
    const now = Date.now();
    if (!contextId) {
      try {
        const stored: unknown = JSON.parse(
          localStorage.getItem(storageKey) ?? "null",
        );
        if (
          stored &&
          typeof stored === "object" &&
          "contextId" in stored &&
          typeof stored.contextId === "string" &&
          "createdAt" in stored &&
          typeof stored.createdAt === "number" &&
          now - stored.createdAt < lifetime &&
          stored.createdAt <= now &&
          "sessionId" in stored &&
          typeof stored.sessionId === "string" &&
          "lastActivity" in stored &&
          typeof stored.lastActivity === "number"
        ) {
          contextId = stored.contextId;
          createdAt = stored.createdAt;
          sessionId = stored.sessionId;
          lastActivity = stored.lastActivity;
        }
      } catch {
        /* Invalid or unavailable storage starts a new context. */
      }
      if (!contextId) {
        contextId = crypto.randomUUID();
        createdAt = now;
      }
    }
    if (!sessionId || now - lastActivity >= sessionLifetime)
      sessionId = crypto.randomUUID();
    lastActivity = now;
    persist();
    return true;
  };
  const enqueue = (
    name: string,
    properties?: EventProperties,
    assertion?: string,
  ) => {
    if (!allowed()) return;
    const url = new URL(location.href);
    const path = options.route
      ? options.route(url)
      : safeJourneyPath(url.pathname);
    if (path === null) return;
    let ids: Pick<BrowserEvent, "mode" | "contextId" | "sessionId">;
    if (mode() === "anonymous") ids = { mode: "anonymous" };
    else if (ensureContext() && contextId) ids = { contextId, sessionId };
    else return;
    let referrer: BrowserEvent["referrer"];
    try {
      const ref = new URL(document.referrer);
      referrer = { host: ref.hostname, path: safeJourneyPath(ref.pathname) };
    } catch {
      /* Direct entry. */
    }
    if (queue.length >= 40) queue.shift();
    queue.push({
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      projectKey: options.projectKey,
      sourceId: options.sourceId,
      environment: options.environment ?? "production",
      ...ids,
      occurredAt: new Date().toISOString(),
      name,
      consent: { ...consent },
      page: { host: url.hostname, path: safeJourneyPath(path) },
      referrer,
      campaign: campaignFrom(url),
      clickId: clickIdFrom(url),
      properties,
      identityAssertion: assertion,
    });
  };
  const flush = async () => {
    if (sending || !queue.length || !allowed()) return;
    sending = true;
    const batch = queue.splice(0, 10);
    const currentGeneration = generation;
    // Stable IDs survive bounded delivery retries; no persistent pre-consent queue.
    let delivered = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!allowed() || currentGeneration !== generation) break;
      try {
        const response = await fetch(options.collectorUrl, {
          method: "POST",
          body: JSON.stringify({ events: batch }),
          headers: { "Content-Type": "text/plain" },
          credentials: "omit",
          keepalive: true,
        });
        if (
          response.ok ||
          (response.status >= 400 &&
            response.status < 500 &&
            response.status !== 429)
        ) {
          delivered = true;
          break;
        }
      } catch {
        /* A tracker must never interrupt the host application. */
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
    // Preserve stable IDs for a later timer flush when a transient delivery
    // fails. Withdrawal increments generation and intentionally drops it.
    if (!delivered && currentGeneration === generation && allowed())
      queue = [...batch, ...queue].slice(0, 40);
    sending = false;
  };
  const pageview = () => {
    if (!allowed()) return;
    const page =
      location.pathname +
      location.search +
      (options.hashRoutes ? location.hash : "");
    ensureContext();
    const previous = lastNavigation.get(key);
    if (
      page === lastPage ||
      (previous?.page === page && previous.contextId === contextId)
    )
      return;
    lastNavigation.set(key, { page, contextId });
    lastPage = page;
    enqueue("page_view");
  };
  const track: JourneyTracker["track"] = (name, properties) => {
    if (!allowed()) return;
    const actionKey = JSON.stringify([
      name,
      properties?.action,
      properties?.destination,
    ]);
    if (
      name === "acquisition_clicked" &&
      actionKey === lastAction &&
      Date.now() - lastActionAt < 250
    )
      return;
    lastAction = actionKey;
    lastActionAt = Date.now();
    enqueue(name, properties);
    void flush();
  };
  const click = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const element = event.target.closest<HTMLElement>(
      '[data-bodkin-event="acquisition_clicked"]',
    );
    if (!element) return;
    track("acquisition_clicked", {
      action: element.dataset.bodkinAction,
      destination: element.dataset.bodkinDestination,
      placement: element.dataset.bodkinPlacement,
    });
  };
  const onPermission = (next: JourneyConsent) => {
    if (
      consent.analytics &&
      (!next.analytics ||
        (consent.attribution && !next.attribution) ||
        (consent.identity && !next.identity))
    ) {
      // Purpose revocation is a control message, not a replay of browsing activity.
      if (contextId)
        void fetch(options.collectorUrl, {
          method: "POST",
          credentials: "omit",
          keepalive: true,
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            events: [
              {
                schemaVersion: 1,
                eventId: crypto.randomUUID(),
                projectKey: options.projectKey,
                sourceId: options.sourceId,
                environment: options.environment ?? "production",
                contextId,
                sessionId,
                occurredAt: new Date().toISOString(),
                name: "consent_withdrawn",
                consent: next,
              },
            ],
          }),
        }).catch(() => {});
      clear();
    }
    consent = next;
    if (allowed()) pageview();
    else clear();
  };
  const pushState = history.pushState.bind(history);
  const replaceState = history.replaceState.bind(history);
  const wrappedPush: History["pushState"] = (...args) => {
    pushState(...args);
    pageview();
  };
  const wrappedReplace: History["replaceState"] = (...args) => {
    replaceState(...args);
    pageview();
  };
  history.pushState = wrappedPush;
  history.replaceState = wrappedReplace;
  const onHidden = () => {
    if (document.visibilityState === "hidden") void flush();
  };
  window.addEventListener("popstate", pageview);
  if (options.hashRoutes) window.addEventListener("hashchange", pageview);
  window.addEventListener("pagehide", onHidden);
  document.addEventListener("visibilitychange", onHidden);
  document.addEventListener("click", click, true);
  const interval = setInterval(() => {
    void flush();
  }, 2000);
  let unsubscribe = noop;
  const tracker: JourneyTracker = {
    track,
    flush,
    identify(assertion) {
      if (allowed() && (mode() === "anonymous" || consent.identity)) {
        enqueue("identity_known", undefined, assertion);
        void flush();
      }
    },
    getContextId() {
      return ensureContext() ? contextId : null;
    },
    reset() {
      clear();
    },
    destroy() {
      void flush();
      stopped = true;
      queue = [];
      unsubscribe();
      clearInterval(interval);
      window.removeEventListener("popstate", pageview);
      window.removeEventListener("hashchange", pageview);
      window.removeEventListener("pagehide", onHidden);
      document.removeEventListener("visibilitychange", onHidden);
      document.removeEventListener("click", click, true);
      if (history.pushState === wrappedPush) history.pushState = pushState;
      if (history.replaceState === wrappedReplace)
        history.replaceState = replaceState;
      trackers.delete(key);
    },
  };
  trackers.set(key, tracker);
  try {
    onPermission(options.consent.getState());
    unsubscribe = options.consent.subscribe(onPermission);
  } catch {
    clear();
    consent = denied;
  }
  return tracker;
}
