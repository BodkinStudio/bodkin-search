# Goal

Allow a later priority-page click decline to begin a new investigation cycle
only after the prior controlling Recommendation's exact template Action has
been measured and reached `evaluated`.

This is BG-0207B: a narrow v2 controller-release policy over the existing
repeat-suppression ledger. It closes the dead end in which one controller
suppresses every future decline forever. It is not a general material-change,
cooldown, restoration or scheduling policy.

# Product outcome

- Proposed, snoozed, dismissed and unresolved/action-in-progress controllers
  continue to suppress repeated Signals exactly as today.
- After the exact template Action for a controller reaches `evaluated`, a
  newly captured decline can release that controller and create one new
  proposed investigation.
- The old Recommendation, Action, controller row and suppressed Signal links
  remain immutable history. Only the controller row's existing release field
  is populated.
- The Opportunities inbox automatically shows the new proposed Recommendation
  through its existing unresolved read model; no client, server-function or
  MCP contract changes.

# Existing source of truth

Reuse the normalized structures already accepted in ADR-046:

- `growth_recommendation_signal_links` owns the stable opportunity key,
  controller/suppressed relationship, policy version and nullable
  `controller_released_at`.
- Its partial unique index permits one unreleased controller per
  project/opportunity key while retaining any number of released historical
  controllers.
- `growth_actions` owns Action status and `evaluated_at`.
- The exact generated Action is qualified by project, controlling
  Recommendation and the existing template creation key
  `priority-page-investigation-v1:action:<controller signal id>`.
- The new Signal's saved `captured_at` is the event-time gate; wall-clock check
  start or write time must not decide whether pre-evaluation evidence reopens.
  Stored timestamps may use any valid RFC 3339 offset, so ordering must compare
  parsed instants rather than text.

Do not add a table, column, index, provider read or duplicated Action state.

# Policy v2

Rename the current exported policy version to
`priority-page-repeat-suppression-v2` for all newly recorded decisions. Keep
v1 rows unchanged.

An active controller is releasable only when all of these are true in the same
authorized project:

1. it is the current unreleased `controller` row for the exact dedupe key;
2. its Recommendation has exactly the generated Action identified by the
   existing template Action creation key and controller Signal ID;
3. that Action status is `evaluated` and `evaluated_at` is non-null;
4. the candidate Signal belongs to its still-running source Run; and
5. the candidate Signal's `captured_at` instant is strictly later than the
   Action's `evaluated_at` instant.

Equality does not release. A Signal captured before evaluation remains
suppressed even if its repository write happens later. Foreign-project,
unrelated, cancelled, implemented or measuring Actions never release a
controller.

At the pure policy boundary, parse both values with the platform date parser,
reject invalid instants and normalize valid values to UTC before comparing
epoch milliseconds. At the atomic repository boundary, use provider-specific
instant conversion instead of lexical ordering:

- SQLite/D1: compare non-null `julianday(...)` values;
- PostgreSQL 16: use one `CASE WHEN` expression that guards both text values
  with `pg_input_is_valid(..., 'timestamp with time zone')`, compares their
  `timestamptz` casts only inside the `THEN` branch, and returns `FALSE` in the
  `ELSE` branch. Do not express this as an `AND` chain because SQL predicate
  evaluation order cannot protect an invalid cast.

Valid offset-bearing historical values therefore retain their real ordering.
Malformed historical values fail closed and remain suppressed; they do not
abort the transaction or trigger a migration/backfill.

The release is lazy: evaluation itself does not mutate the decision ledger.
The next eligible decline performs the release while recording its own
decision. This keeps Action finalization independent and avoids a new
cross-feature mutation hook.

# Candidate identity and concurrency

The current `initial-controller` deterministic IDs cannot be reused for a
second graph. Introduce a deterministic controller-cycle key:

- first ledger controller: `initial-controller`;
- controller after release: the exact prior controller Recommendation ID.

Derive both candidate Insight and Recommendation IDs from project, dedupe key,
cycle key and kind. Concurrent Signals attempting to reopen the same evaluated
controller therefore propose the same parent IDs. A later evaluated cycle uses
its different Recommendation ID and receives distinct graph IDs.

Add a bounded repository preflight read that returns only the current active
controller coordinate and whether its exact Action is evaluated before the
candidate Signal was captured. This read chooses the cycle key but grants no
write authority. The atomic write must requalify the exact controller,
template Action, Action state/timestamp, candidate Signal and running Run.

Extend the existing provider-aware `writeDecision` batch so its ordered
transaction:

1. conditionally stamps the exact active controller's
   `controller_released_at` with this operation's canonical decision time;
2. inserts the candidate graph only when that exact conditional release was
   made, or when no controller existed for a genuine first cycle;
3. claims the new controller through the existing partial unique index; and
4. records the candidate Signal as suppressed against whichever active
   controller won when it did not win itself.

Every candidate graph insert must be guarded by the same exact release marker
or first-controller condition. A stale preflight may suppress but must never
release a different controller, create an orphan graph or overwrite a release.
The existing signal decision unique key preserves exact retry semantics.

On PostgreSQL, the conditional update of the active controller is the
serialization point; a competing transaction must re-evaluate after the row
lock. On D1/SQLite, preserve the existing ordered atomic batch. The shared
candidate IDs plus guarded fact-hash reads ensure a losing transaction cannot
attach children to the winner's different Signal facts.

# Legacy adoption boundary

Keep exact pre-ledger adoption conservative and migration-free. If no ledger
controller exists, the existing exact legacy qualification remains the first
authority. A legacy graph may be adopted as the active controller and suppress
that Signal as today. Once adopted, the next later captured decline can apply
the v2 release rule. Do not infer an evaluation/release directly from an
unadopted legacy graph in this slice.

# Implementation sequence

1. Add pure policy helpers/constants for the v2 version, strict
   post-evaluation instant rule, RFC 3339 offset normalization and
   controller-cycle identity; expand the policy matrix tests.
2. Add a project/dedupe-bounded active-controller release preflight to
   `GrowthOpportunityDecisionsRepository`, returning only the coordinates and
   exact template Action status/timestamp needed by the service.
3. Have `GrowthOpportunityDecisionsService` derive the cycle key and distinct
   deterministic graph IDs from that preflight while preserving exact Signal
   retry short-circuiting.
4. Extend the existing atomic decision batch with the exact conditional
   release, guarded candidate creation and winner/suppression behavior.
5. Add SQLite/D1 integration coverage for lifecycle states, time ordering,
   history retention, retry and tenant/action qualification.
6. Add a live PostgreSQL 16 concurrency test proving two post-evaluation
   Signals create one new controller, one suppression link and no orphan graph.
7. Update ADR-046 and the preview operating notes with the v2 boundary.

# Constraints and non-goals

- No dependency, migration, schema/index, provider call, credential, credit,
  LLM, detector, server function, UI, MCP, report, scheduler or separate
  service/database/auth system.
- No dismissal cooldown or restoration, snooze wake-up, cancellation release,
  material-change threshold, warning/critical escalation bypass, semantic URL
  matching or cross-detector dedupe.
- No release merely because a Recommendation is dismissed, merged,
  superseded, accepted, implemented or measuring.
- No mutation during Opportunities, MCP, summary or other read paths.
- No backfill and no direct release of an unadopted legacy graph.
- No claim that a recurring decline was caused by prior Work or that a new
  Recommendation will improve performance.
- No browser, HTTP, CDP, Playwright, dev-server or screenshot work under the
  standing session constraint.

# Required behaviour

1. Existing proposed, snoozed, dismissed, accepted-without-Action and exact
   Actions in approved/ready/in-progress/blocked/implemented/measuring continue
   to suppress new Signals with their existing saved reasons.
2. Only an exact template Action in `evaluated` can release; unrelated and
   foreign-project Actions cannot qualify.
3. A candidate Signal's instant must be later than the evaluated instant.
   Earlier, equal or malformed evidence is suppressed and does not populate
   `controllerReleasedAt`; valid timezone offsets must not change ordering.
4. A winning later Signal releases only the previous controller, creates a
   distinct proposed graph and becomes the sole active controller.
5. The released controller row and every historical suppressed decision remain
   readable and continue resolving to their original Recommendation.
6. A later Signal after the new controller is created suppresses against the
   new controller until its own exact Action is evaluated.
7. Exact retries return the original decision without another release or
   graph. Concurrent post-evaluation Signals produce one controller and one or
   more suppressions, never duplicate controllers or orphan graph rows.
8. All new decisions record policy v2; existing v1 records are never rewritten.
9. The current Opportunities read automatically excludes a released historical
   controller source and includes the new unresolved Recommendation without a
   DTO or query-key change.

# Verification

- Pure policy tests for every Recommendation/Action lifecycle state, equality,
  malformed values and RFC 3339 offset pairs whose lexical and instant orders
  disagree in both directions.
- Focused SQLite/D1 repository/service/integration tests for release, retry,
  history, project isolation, unrelated Action rejection and a second cycle.
- PostgreSQL repository concurrency test against a disposable migrated
  PostgreSQL 16 database, including graph-row counts, active-controller
  uniqueness, valid equivalent offsets, lexically-later-but-earlier and
  lexically-earlier-but-later timestamps, plus a repository write with
  malformed values that records suppression without releasing or throwing.
- Type check and affected-file type-aware lint while iterating.
- Fresh independent code/data/concurrency review; repair verified findings
  only. No rendered-product review is required because no client code changes.
- `pnpm ci:check`, true one-worker full Vitest suite and production build under
  `NODE_OPTIONS=--max-old-space-size=4096`, run sequentially.
- Staged and unstaged whitespace checks plus a staged credential-pattern scan
  before commit.

# Acceptance boundary

Acceptance means the first detector can start another auditable investigation
cycle after its prior exact Work is evaluated, with provider-equivalent atomic
concurrency and immutable history. It does not mean general recurrence policy,
live Gate 2 validation, monthly orchestration, scheduling or additional
detectors are complete.
