# Goal

Complete the existing BG-0208 human-review loop for saved deterministic
priority-page investigations. Alongside the existing approval path, an
authorized project user can dismiss a proposed suggestion, snooze it until a
future UTC date, or return a snoozed suggestion to review now.

This is an app-only, provider-free patch over the existing Recommendation
review state machine. It does not implement opportunity discovery,
`growth_find_opportunities`, Recommendation review over MCP, or any new data
model.

# Product outcome

- A proposed investigation keeps its current explicit due-date approval form.
- The same card also offers a labelled dismissal reason and a labelled future
  snooze date using native controls.
- A dismissed investigation shows its saved reason and has no mutation control.
- A snoozed investigation shows its saved date and offers Review now.
- Accepted/action-backed and legacy accepted states retain their existing copy
  and controls.
- Pending, uncertain, stale and failed writes remain explicit; no mutation is
  dispatched on mount, reload or refetch.

# Implementation approach

1. Add a runtime strict investigation-view schema and project Recommendation
   review version, dismissal reason and canonical nullable snooze timestamp
   into it. Reuse the existing closed PRD dismissal vocabulary instead of
   introducing another list. Explicit projection plus strict parsing excludes
   run IDs, raw targets, resolution metadata and future repository columns.
2. Add a strict discriminated review request:
   - `dismiss` requires an allowed dismissal reason and expected review version;
   - `snooze` requires a valid calendar date and expected review version;
   - `review_now` requires only the expected review version.
     The server derives `proposed -> dismissed`, `proposed -> snoozed`, or
     `snoozed -> proposed`; callers cannot submit arbitrary statuses or metadata.
3. Add `GrowthInvestigationsService.reviewInvestigation`. First qualify the
   same-project terminal supported Run/Signal/template through `getSaved`, then
   delegate the versioned compare-and-set transition and exact-replay behavior
   to `GrowthInsightsService.reviewRecommendation`. Re-read and return the safe
   investigation view after success.
4. Add one `requireProjectContext` server function. Ignore the model-visible
   project ID and inject the authorized project. No actor field is invented:
   the existing review schema records versioned status/metadata/review time,
   while Action approval remains the separately audited actor-bearing path.
5. Patch the established investigation card with native labelled select/date/
   button controls. Use the current React Query retry pattern: freeze the exact
   submitted review after an uncertain result, allow only exact retry or safe
   refresh, and update the saved view on confirmed success.
   The snooze label/help names UTC and its native minimum is the next UTC
   calendar date derived at render time.
6. Extend the existing live PostgreSQL approval/review race fixture so both
   proposed review outcomes (`dismissed` and `snoozed`) race atomic approval.
   The approved winner must own a complete Action/target/event graph; a review
   winner must leave no Action, target or event. `review_now` starts only from
   `snoozed`, while approval starts only from `proposed`; add a fixture proving
   these mutually exclusive starting states cannot create an Action.
7. Update the Growth ADR/preview guide and add focused schema, service,
   server-function, static-render and dispatch tests.

# Constraints

- No dependency, migration, schema table, provider, credit, LLM, Action,
  Signal, Measurement, report, schedule, MCP or SAM change.
- Only a supported saved priority-page investigation from the authorized
  project can be reviewed through this boundary.
- Dismiss/snooze begin only from `proposed`; Review now begins only from
  `snoozed`. Approval and proposed review serialize through the existing
  transaction plus status/version CAS. Acceptance requires live-provider race
  evidence; if it does not hold, stop for an ADR instead of weakening it.
- A new snooze must end in the future. The UI sends a calendar date and the
  server deterministically stores its UTC start; the existing service validates
  that exact timestamp. Exact persisted retry remains valid after time passes.
- Exact retries return the saved winner. A stale version, different review fact
  or illegal state conflicts rather than overwriting newer review.
- Dismissed suggestions stay terminal in this slice. Snoozed suggestions do not
  auto-revive; Review now is explicit.
- The UI is classified as a local non-material PATCH because it preserves the
  existing disclosure/card hierarchy, native form vocabulary and flex wrapping;
  it adds no screen, dialog, navigation, custom widget or responsive
  composition. Static markup and dispatch tests verify its functional and
  semantic contract. Browser/screenshot testing remains prohibited by the
  current session constraint, so no visual/responsive-quality claim is made; if
  implementation expands beyond this local shape, reclassify it as material and
  defer visual acceptance until rendered evidence is allowed.

# Required behaviour

1. `getInvestigation` returns a runtime-strict safe review state needed by the card:
   review version, closed status, nullable closed dismissal reason and nullable
   canonical snooze timestamp. It exposes no review internals or raw graph.
2. The review server function always uses `context.projectId`; a forged input
   project cannot select another tenant. Qualification precedes review mutation.
3. Dismiss maps a proposed version to dismissed with exactly one allowed reason;
   snooze maps a proposed version to snoozed at `YYYY-MM-DDT00:00:00.000Z`;
   Review now maps a snoozed version to proposed and clears review metadata.
   Snooze UI explicitly labels UTC, sets its minimum to the next UTC date and
   surfaces server validation failure without exposing internals.
4. Existing `GrowthInsightsService` owns future-time validation, transition
   legality, compare-and-set concurrency and exact replay. The investigation
   service does not duplicate repository writes.
5. On confirmed success the client replaces the cached investigation with the
   server projection and invalidates current saved Recommendation summaries.
6. A pending review disables all review and approval dispatch. An uncertain
   review freezes the exact original payload and offers Retry review and Refresh
   saved investigation; it never silently sends a changed review.
7. Proposed UI has accessible native labels and required fields for dismissal
   reason and snooze date. Dismissed/snoozed status copy states the saved fact in
   plain language. Review now is a named native button. Merged and superseded
   records remain read-only terminal states with no approval/review dispatch.
8. Existing approval, work-list, read-error, legacy approval and absent-result
   behavior remains unchanged.

# Verification

- Schema tests cover every dismissal reason, discriminated unknown-field and
  cross-decision metadata rejection, invalid dates and exact request types.
- Runtime DTO tests reject raw run, resolution, actor, hash and unknown fields;
  the service projection contains only the documented safe card keys.
- Service tests cover same-project qualification, all three mappings, future
  snooze conversion, exact retry, stale/illegal conflicts and no Action/provider
  side effects.
- Server-function tests prove authorized project injection and strict input.
- Static-render tests cover proposed, dismissed and snoozed controls/status,
  labels, native required fields, next-UTC minimum, surfaced validation errors,
  read-only merged/superseded states and unchanged accepted states. Static tests
  assert semantic source order and that pending review disables both review and
  approval fieldsets.
- Submission tests prove no mount dispatch, duplicate-dispatch blocking,
  confirmed cache replacement, exact frozen retry and no changed retry.
- Existing Recommendation review, priority Recommendation read, investigation
  approval/work and Growth tests pass; then run `pnpm ci:check`, the full suite,
  production build and staged/unstaged whitespace checks sequentially with the
  Node heap capped at 4 GB.
- Fresh independent review must pass before commit.
- Live PostgreSQL acceptance runs approval concurrently with dismiss and snooze,
  proving exactly one winner and a graph consistent with Recommendation state.
  A snoozed-to-proposed Review now fixture proves no Action can be created from
  that mutually exclusive state. SQLite/D1 aggregate guards continue to pass.

# Review focus

Challenge tenant qualification, arbitrary-state input, expected-version replay,
future snooze timing, approval/review races, dismissal vocabulary drift,
metadata clearing, mutation-on-render hazards, accessible form semantics and
regressions to the existing approval path.
