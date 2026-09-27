# Cookieless journey analytics (anonymous mode)

**Status:** ready to build · **Owner decision:** James, 2026-09-25 · **Branch:** `codex/journey-analytics`

## Why

YakChat's visitors almost never accept the cookie banner, so the consent-first
tracker sees next to nobody. The product decision: journey analytics must work
**without consent**, with consented tracking running alongside it for the
visitors who do accept.

The route is to stop storing anything on the device before consent, not to
ignore consent. PECR/ePrivacy governs *storing or reading information on the
device*; a storage-free beacon keyed on the server from what the browser already
sends (IP + User-Agent) falls outside it. The IP is still personal data under
GDPR, so this relies on **legitimate interest**. That needs a short LIA, a
privacy-notice line, no raw IPs stored, daily-rotating keys, short retention,
and honouring DNT/GPC. Plausible and Fathom take the same position. Compliance
should sign off before the switch is turned on for a project.

## The design in one paragraph

A new event `mode: "anonymous"` carries **no** `contextId` and **no**
`sessionId`. The collector derives the visitor key itself:
`anon:<UTC day>:<HMAC(networkSecret, project|source|day|ip|user-agent)>`. The
context-key column is plain text, so **no DB migration** is needed, and
anonymous contexts are recognisable by the `anon:` prefix. From there everything
downstream is unchanged: sessions, action allow-list, IP-time matching, entries,
identity binding and outcomes. The whole feature is gated by a **per-project
switch, default off**.

## Already done (uncommitted on this branch)

- `src/types/schemas/analytics.ts`: `mode: "consented" | "anonymous"`
  (optional); `contextId` optional; `superRefine` requires no IDs and no
  `consent_withdrawn` for anonymous events, and a `contextId` for consented
  ones.
- `src/server/features/analytics/crypto.ts`: `anonymousContextKey(secret,
  projectId, sourceId, ip, userAgent, now)` and `ANONYMOUS_CONTEXT_CLAIM =
  "anonymous"`.

Check both. The schema change makes `contextId` optional, so fix any type fallout
(`event.contextId` is now `string | undefined`).

## To build

### 1. Per-project switch (default off)
- Add `anonymousCollection` (boolean, default `false`) to the project's analytics
  settings, i.e. whatever `repo.settings(projectId)` / `AnalyticsRepository`
  reads. If that needs a column, add the migration in **both** `drizzle/`
  (SQLite) and `drizzle-pg/` and keep `schema-parity.test.ts` green.
- Expose it in Settings → Analytics beside "Customer unit". Use a plain
  description: *"Count visitors who haven't accepted cookies, without storing
  anything on their device (keyed daily from IP + browser; relies on legitimate
  interest — update your privacy notice first)."*
- When it's off, the collector drops anonymous events (skip, no error).

### 2. Collector (`AnalyticsCollection.ts`)
- `collect()` input gains `userAgent?: string | null`. `handleCollect` in
  `AnalyticsHttp.ts` passes `request.headers.get("user-agent")`.
- Per event: if `mode === "anonymous"`:
  - skip unless the project switch is on, `observedIp` is set (edge only; still
    never forwarded headers) and `networkSecret` is set;
  - `contextKey = anonymousContextKey(...)`;
  - build an effective event with `contextId: contextKey` and consent `{
    analytics: true, attribution: true, identity: true, policyVersion:
    "li:" + raw.policyVersion }`, truncated to 100 characters.
  - Otherwise `contextKey = event.contextId`.
- Use `contextKey` for the tombstone check, `repo.context(...)` and the context
  insert. Everything below that can keep using the effective event.
- **Adopt on consent:** for a consented event whose context doesn't exist yet,
  compute today's anonymous key for the same IP + UA. If that context exists,
  update its `contextKey` to the new ID (and its `policyVersion`) rather than
  inserting. The day's history carries over and the visitor isn't counted
  twice.
- `bindIdentity(...)` gets the expected context claim: `"anonymous"` for
  anonymous events, else the context key (next section).

### 3. Identity (`AnalyticsAttribution.ts` → `bindIdentity`)
- Take an `expectedContextClaim` parameter and pass it to
  `verifyIdentityAssertion` in place of `event.contextId`.
- An anonymous visitor's page can't know its server-derived key, so the
  website signs `contextId: "anonymous"`. The assertion stays bound to project,
  source and a lifetime of 10 minutes or less, and it lands on whichever day
  context the submitting request keys to.
- Known limitation, acceptable: an assertion replayed from another
  IP/UA within its lifetime would bind that other context. The impact is a
  misattributed journey, not access.

### 4. Outcomes without a context (`AnalyticsOutcomes.ts`)
- Today an outcome with no `contextId` gets `"client_observation_missing"`.
  Add a fallback: once the customer is known, if `event.contextId` is absent,
  use that customer's most recent context with `attributionAllowed` (for
  example, `analyticsContexts.customerId = customer.id` ordered by
  `lastSeenAt` desc). Use it for `acquisitionEvidence` and `outcome.contextId`.
- Keep the existing rule: when a `contextId` **is** sent, it must be verified
  and belong to the customer.

### 5. Tracker (`src/client/analytics/tracker.ts`)
- New option `anonymous?: boolean` (default `false`).
- Mode decision:
  - opted out (DNT/GPC) or stopped → nothing;
  - `consent.analytics` → today's consented behaviour, unchanged;
  - otherwise, if `anonymous` → anonymous mode.
- Anonymous mode:
  - **never touch localStorage** (no `ensureContext`/`persist`);
  - events carry `mode: "anonymous"` and no `contextId` or `sessionId`;
  - page views, clicks and `identify()` all work; `getContextId()` returns
    `null`.
- On consent granted mid-page, switch to consented mode as now; the server
  adopts the anonymous context.
- On withdrawal: send the `consent_withdrawn` and clear as now, then fall back
  to anonymous mode, which stores nothing.
- Rebuild `public/bodkin-journeys.js` (`pnpm build:tracker`).

### 6. Tests
Use the in-memory libsql harness in
`AnalyticsCollection.integration.test.ts` and fixture helpers in
`collection-test-fixture.ts`.
- anonymous page_view + click → one `anon:` context. The same IP+UA the same
  day gives the same context; a different UA or the next day gives a
  different one;
- no raw IP persisted anywhere; the switch off → anonymous events dropped;
  missing `observedIp` → dropped;
- anonymous identity with the `"anonymous"` claim binds the day context. The
  outcome without `contextId` then attributes via the fallback (method `exact`,
  reason `verified_context`);
- consent adoption: anonymous events, then a consented event from the same
  IP+UA → one context, re-keyed to the UUID, events preserved;
- schema: an anonymous event with a `contextId` is rejected, and a consented
  event without one is rejected;
- tracker unit tests where the existing tracker tests live: anonymous mode
  never writes localStorage and never sends IDs; switching to consented mode
  on grant.
- `pnpm test`, typecheck and `pnpm lint` all green.

## Consumer changes (other repos, after this ships)

- **yakchat.com** (`frontend/components/BodkinJourneyTracker/BodkinJourneyTracker.tsx`,
  branch `feat/bodkin-journey-tracking`): pass `anonymous: true` to
  `initJourneyTracker`.
- **Sherpa website** (`apps/website/src/lib/trial/journey-tracker.ts` →
  `startJourneyTracker`): pass `anonymous: true`.
- **`apps/website/src/lib/trial/bodkin.ts` / `service.ts`:** when there is no
  `contextId`, still sign the identity assertion, with `contextId:
  "anonymous"`. The client already calls `identify()` whenever an assertion
  comes back. `trial_started` already falls back to sending without a context.
- **Privacy notice:** add the legitimate-interest analytics line on yakchat.com.

## Rollout
1. Build and test here → commit (stage only these files; the branch has
   unrelated uncommitted work).
2. James deploys search.bodkin.studio (`pnpm deploy:selfhost`). Apply any
   settings migration.
3. Compliance OK → turn on **anonymousCollection** for the YakChat — US project.
4. Ship the two consumer changes. Then check that Tracking health shows
   accepted events from non-consenting browsers, and that a `/trial` sign-up
   links to its same-day journey.

## Not in scope
Fingerprinting beyond IP + UA (screen, fonts, canvas). That would bring PECR
back in. Cross-day stitching of anonymous visitors: that's by design; consented
tracking covers it.
