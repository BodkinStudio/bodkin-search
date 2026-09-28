# Journey Analytics

## Current implementation

Project navigation → Analytics contains Overview, Journeys, Acquisition, Funnels and Customers. Settings → Analytics registers sources and controls consent-related inspection, matching windows, outcomes, diagnostics and erasure. The website map draws **observed pages**, directed transitions and repeat visits from retained page events. Select a journey to highlight its ordered steps. Verified customer paths are separate from inferred acquisition evidence.

The local demonstration is the project **DEMO — Journey Analytics**, environment **Test**. Its events pass through the collection and outcome services. It is synthetic evidence, not a completed external pilot or production data.

## Installation

1. Apply all new migrations for your database provider using the existing migration command. SQLite and Postgres schemas are mirrored; migrations have been applied successfully on local SQLite and an isolated Postgres 16 database.
2. Configure deployment secrets `ANALYTICS_NETWORK_HMAC_SECRET`, `ANALYTICS_IDENTITY_ASSERTION_SECRET`, `ANALYTICS_SERVER_EVENT_SECRET` and `ANALYTICS_ERASURE_HMAC_SECRET`. Generate independent high-entropy values and keep them out of browser code.
3. Register each exact website/product hostname and environment in Settings → Analytics. Use separate test sources first. Source keys are public routing identifiers, not authorisation credentials.
4. Install the generated `/bodkin-journeys.js` using the snippet shown for the source. Wait for script load before calling `BodkinJourneys.initJourneyTracker`. Supply your existing consent adapter with `getState()` and `subscribe(listener)`. It returns `analytics`, `attribution`, `identity` and `policyVersion`. Unknown permissions are false.
5. Allow the Bodkin host in CSP `script-src` and `connect-src`. Automatic page views start only after analytics permission. Explicit links use `data-bodkin-event="acquisition_clicked"`, `data-bodkin-action="start_trial"` and `data-bodkin-destination="product"`. Navigation is never prevented.
6. For a product source, call `tracker.track('product_opened')` when the product actually opens. This does not prove a marketplace install.
7. Use `tracker.identify(assertion)` with a short-lived backend-signed assertion only after identity permission. Call `reset()` on logout/account switch. Destroy the tracker on application teardown. A React adapter is available in `src/client/analytics/useJourneyTracker.ts`.

`pnpm build:tracker` regenerates the standalone bundle; the production build includes this step. The browser contract and integration tests are executable documentation.

## Verified identity and outcomes

The backend integration receives a **project-derived** key, never a deployment root secret. `deriveProjectSecret(root, projectId, purpose)` in `src/server/features/analytics/crypto.ts` derives separate identity, server and outbox keys. Provision these keys through a trusted deployment process. There is no browser key-generation endpoint.

Identity assertions use HS256, audience `journey-analytics`, purpose `identity`, project/source/context, issuer, user ID, optional organisation ID and a maximum 10-minute lifetime. The browser context must be verified before a server outcome can reference it. Anonymous public events cannot create revenue or verified customer acquisition.

Send authoritative events to `POST /api/analytics/events/server` with a stable external event ID. Sign the exact JSON bytes and millisecond timestamp using `signBackendRequest`; headers are `x-bodkin-timestamp` and `x-bodkin-signature`. The Zod contract in `src/types/schemas/analytics.ts` defines the accepted fields. Payments/refunds require currency, integer minor units and a stable payment reference. Refund totals cannot exceed the original payment.

Network matching uses the native Cloudflare request context and `CF-Connecting-IP` only. Forwarded headers and backend webhook addresses do not establish browser acquisition. Local development has no trusted public edge address. The short-lived installation diagnostic token permits comparing actual browser/product addresses without storing them in analytics records.

## Webhook delivery

Configure the project's HTTPS webhook URL and the deployment `ANALYTICS_WEBHOOK_HOSTS` comma-separated hostname allowlist. The existing scheduled worker delivers the outbox with signed exact JSON and an independent monotonically increasing `deliveryVersion`. Both authoritative lifecycle events and attribution corrections enqueue deliveries. `decisionVersion` identifies the saved attribution decision, which may be absent before acquisition. Receivers must verify signatures, deduplicate `idempotencyKey`, and reject stale delivery versions. The payload includes the immutable originating outcome and saved first-touch/acquisition-touch fields when available. Manual attribution never establishes verified personal identity. Redirects are rejected and delivery has a five-second timeout. Tracking health and customer evidence expose failed/pending deliveries.

## Privacy and operations

Raw IP addresses are not saved in event rows. Project/day HMAC observations expire after 48 hours; provisional entries after seven days. Retained events/contexts expire after the configured 7–90 days. Scheduled cleanup runs with the existing daily maintenance task. Context withdrawal removes retained events and creates a replay tombstone. Administrators can erase a whole customer or a context from settings using the internal record ID.

Daily aggregate counts are archived before raw events expire and retained for 13 calendar months. Archived visitor counts are visitor-days and cannot be summed into unique people. The retained-history panel uses UTC archive days independently of the live report timezone. Customer/outcome detail has a separate configurable 30–730-day retention period, refreshed by later verified outcomes. Payment deduplication and refund reconciliation require the original retained payment; integrations must not replay transactions beyond this retention horizon.

Customer erasure stores only a project/environment-scoped HMAC of the external identity in a protected replay ledger. Keep `ANALYTICS_ERASURE_HMAC_SECRET` stable and backed up securely; losing or casually rotating it breaks replay protection. Erasure fails closed if the secret is missing. Context withdrawals retain replay tombstones. Customer-specific audit and pending delivery records are erased too.

For a backup restore:

1. Pause ingestion, customer corrections and outbox delivery.
2. Restore the database, then restore the **latest** erasure-key ledger and context tombstones from an independently retained backup, preserving rows newer than the restored snapshot.
3. Run `replayErasureLedger(projectId)` for each restored project using the same erasure HMAC secret. It removes restored customer data matched by the ledger. Also replay context tombstones through the context-erasure path before reopening collection.
4. Verify erased identities and contexts cannot be re-ingested, then resume services. Backup scheduling and restore execution remain deployment-operator responsibilities; a stale ledger is not privacy-safe.

Reports use a configurable project timezone, calendar windows and optional preceding-period comparisons. Saved Search Console page metrics appear only as aggregate source context with their original source periods and timezone; they never identify visitor search queries. Administrators can map funnel stages/actions, define onboarding completion and wait periods, exclude path prefixes, and inspect configuration-change audit history. Unknown instrumentation is distinct from a completion not observed after the waiting period.

Personal inspection requires both the project setting and workspace owner/admin permission across app and MCP. The trusted `local_noauth` administrator works without hosted membership rows. Cloudflare Access deployments can provision admin membership or explicitly list trusted authenticated IDs in deployment `ANALYTICS_ADMIN_USER_IDS`; project authorization still applies. Aggregate reports remain available to authorized project members.

## Verification commands

- `pnpm lint:analytics` — feature lint, including `shadcn/no-unknown-classes`.
- `pnpm exec vitest run src/server/features/analytics src/client/features/analytics src/client/analytics src/db/schema-parity.test.ts` — boundary, matching, money, query, map and schema checks.
- `pnpm exec playwright test --config playwright.analytics.config.ts` — standalone tracker in Chrome, independent of the application server.
- `pnpm ci:check`, `pnpm test`, `pnpm build` — repository gates.

The deliberate unknown-class lint probe was rejected and removed. `bodkin-ui.config.json` connects the actual feature lint and typecheck to UI preflight.

## Remaining acceptance limitations

External deployment acceptance remains separate from local verification: Postgres runtime service behavior, realistic load, actual host CSP/network parity and a real browser/product/webhook pilot have not been exercised. Reports reject oversized windows instead of silently truncating aggregate data (20,000 events/outcomes, 10,000 retained customers). Journey lists/maps are intentionally bounded and expose their limits. Local screenshots use synthetic Test data. No production deployment or paid data fetch is part of this implementation.
