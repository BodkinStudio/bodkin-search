# Goal

Complete Gate 3 with a human-reviewed Growth Measurement Result: an authorized
user reviews the stored comparison and current confounder context, explicitly
chooses an observational outcome and confidence, and atomically moves Work from
Measuring to Evaluated through the existing Measurement finalizer.

# Scope

1. Add a server-derived review projection for active Plans. It must use the
   frozen report timezone and the core primary-evidence rule, distinguish
   waiting, ready, not-measurable-only and closed states, and issue an opaque
   review revision bound to the Plan/action version, exact Observation fact set
   and current bounded confounder-discovery context at mutation preflight.
2. Extend the core finalizer with an optional expected Observation hash for
   human review. When supplied, evidence drift before or during the atomic write
   conflicts instead of accepting the core's ordinary one-time Observation
   retry. Existing non-human callers retain their current retry behaviour.
3. Add one strict Work-level finalization input and authorized server function.
   The browser may submit only project routing, Action/version, review token,
   outcome, confidence, summary and selected Change Event IDs. The server
   derives the Plan, overwrites project identity, injects the authenticated user
   and fixed human provenance, and supplies no model provenance.
4. Extend the Work read model with review readiness and the surviving selected
   confounder records on a completed Result. Apply existing credential-safe text
   and URL boundaries before any narrative enters the client DTO.
5. Add an inline accessible review form after observed comparisons and possible
   confounding changes. Keep outcome and 0–100% confidence blank and
   human-selected, never auto-select candidates, explain confidence and outcome
   semantics, and warn that finalization is immutable and non-causal.
6. Freeze the complete request, reviewed candidates and measurement
   presentation through an ambiguous response and a client-component remount.
   Disable refresh, collection and automatic measurement reads on mount,
   reconnect or focus while finalization is pending or uncertain; offer only
   exact retry or an authoritative saved-result check.
7. Render the immutable completed Result, including safe currently surviving
   selected confounder details and a truthful empty state that does not promise
   permanent Event snapshots.

# Repository evidence

- `GrowthMeasurementsService.finalizeMeasurement` already owns the due-date,
  evidence, confounder, idempotency and lifecycle rules.
- `GrowthMeasurementFinalizationWriter` already creates the Result, links
  confounders, completes the Plan and transitions the Action atomically on both
  database providers.
- Work start and collection already use authorized TanStack server functions,
  exact-retry UI patterns and monotonic Work/measurement cache updates.
- ADR-033 defines discovered candidates as current advisory context rather than
  an exhaustive or causal set.

# Decisions

- Review becomes available on the first calendar day after the final configured
  measurement date in the Plan's frozen report timezone.
- Ordinary outcomes require complete primary evidence exactly as the core does.
  `not_measurable` remains an explicit human escape for incomplete primary
  evidence after the window closes; it does not bypass tenancy, version, date or
  confounder checks.
- Confidence means strength of support for the human interpretation. It is not
  probability of causation, statistical significance or data completeness. No
  values or thresholds are suggested automatically.
- Discovered candidates are selectable context, not an allowlist or transaction
  snapshot. The revision detects a changed complete candidate set before the
  server accepts the mutation. A new or deleted unselected Event after that
  preflight may not be represented in the Result; the atomic boundary protects
  only the exact Observation facts and explicitly selected confounders. The
  existing core remains authoritative for same-project existence and anchor
  exclusion, preserving legitimate site-wide/manual context and legacy
  finalization.
- The review revision is an untrusted 64-character SHA-256 state coordinate, not
  a secret, signed capability or authorization token. The server never parses
  or trusts browser claims inside it; it independently recomputes a canonical
  digest containing the project, Plan, Action version, Observation hash,
  discovery state and deterministically ordered complete candidate IDs, then
  requires exact equality. Project authorization and actor identity remain
  separate server context. Completed exact retries are governed by the existing
  immutable Result fact and actor-event contract.
- Result confounder details are current surviving Event links. Event deletion
  can remove a link while preserving the Result; this slice does not claim a
  tombstone or historical Event snapshot.

# Constraints

- No dependency, database schema, migration, auth-system, provider, scheduler or
  MCP changes.
- No automatic outcome, confidence, causal attribution or candidate selection.
- Never accept browser-supplied Plan, actor, note, model, prompt, Observation,
  hash, timestamp or lifecycle coordinates beyond the explicit review token and
  Action version.
- Do not call Search Console or any paid provider during read, review or
  finalization.
- Preserve exact retry, competing-winner conflicts and the existing atomic
  writer. Do not claim that advisory unselected candidates are serialized by
  that writer.
- Browser/rendered screenshot evidence is waived by the user's explicit
  browser-tool restriction; server-render and interaction tests are the UI
  evidence.

# Verification approach

- Focused schema, review-token, core-finalizer, Work wrapper, server-function,
  form, submission/cache, collection-lock and server-render tests.
- Exact timezone boundary, incomplete/complete primary evidence,
  `not_measurable`, malformed/tampered/cross-coordinate revisions, Observation
  races, lost response, concurrent winner, actor/authority rejection,
  preflight candidate drift and safe terminal display.
- `pnpm ci:check`
- `pnpm test:ci`
- `pnpm build`
- `git diff --check` and staged whitespace
- Fresh adversarial review against `acceptance.md`, capped at two repair rounds.

# Non-goals

AI interpretation, automatic confidence reduction, statistical thresholds,
site-wide candidate inference, persisted candidate snapshots, correction or
supersession, Change Event tombstones, scheduled finalization, reports and MCP.
