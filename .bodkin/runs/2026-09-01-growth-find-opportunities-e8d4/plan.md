# Goal

Implement and independently accept the missing deterministic opportunity-feed
prerequisite for BG-0606. This run does **not** implement or register
`growth_find_opportunities`.

The smallest honest slice is one saved, curated-page striking-distance path:
an explicit manual scan reads final GSC facts, applies a deterministic rule and
saved-work suppression, then persists the existing Growth
Run → Signal → Insight → Recommendation graph. A separate read-only service
returns those saved Recommendations as the first opportunity feed.

# Discovery decision

- OpenSEO's existing live `SearchOpportunityService` is useful upstream
  candidate analysis, but a repeated provider read is not a stable saved Growth
  feed and it lacks Growth review/work suppression.
- The existing priority-page click-decline path is a risk investigation, not an
  opportunity detector; its Recommendation has placeholder priority and zero
  confidence.
- The project summary's five unresolved Recommendations and monthly report's
  approved/ready Action queue do not implement the PRD opportunity feed.
- Therefore BG-0606 remains blocked until this prerequisite has passed focused
  tests, independent verification, fresh full review and final acceptance in
  its own run.

# Scope

## 1. Pure striking-distance detector

- Add a strict captured-candidate input and pure detector for exact curated key
  pages.
- Version-1 materiality is fixed: final GSC page facts for one 28-day window,
  at least 100 impressions, and average position 4 through 15 inclusive.
- No missing row is interpreted as zero. Only rows actually returned by GSC can
  create candidates. A 1,000-row source cap is disclosed by the owning run and
  prevents any project-wide completeness claim.
- Curated key-page identity supplies the business basis. Commercial relevance
  is its stored 1-5 weight; a null weight uses the explicit conservative floor
  of 1. Non-curated GSC rows never become version-1 candidates.
- Each eligible page produces one deterministic Signal and one deterministic
  investigation template. The evidence digest covers the detector version,
  project/property coordinate, canonical key page, window/capture time,
  thresholds and the complete allowlisted GSC row.
- The Signal records the observed threshold fact
  `gsc_striking_distance_impressions`: baseline is the 100-impression
  materiality floor, current is reported impressions, and delta/percent are
  relative to that rule threshold. Its confidence is 1 only for deterministic
  rule qualification, never for a diagnosis or predicted uplift.
- The rule-based Insight/Recommendation says the page is worth investigation,
  not that a particular change will improve it. Recommendation confidence is
  the explicit uncalibrated convention 0.5; effort 1 is the effort of the
  proposed investigation, not implementation; urgency is a transparent
  position band; impact is a transparent impression band.
- Provisional priority follows the PRD's discrete model:
  `(impact * commercialRelevance * 0.5 + urgency) / investigationEffort`,
  rounded to two decimals. The component values remain visible in the saved
  Recommendation.

## 2. Explicit manual scan orchestration

- Add `GrowthOpportunityScanService.runScan({ projectId })` as an internal
  mutation service. It is not an MCP tool, scheduler, route, server function or
  hidden read side effect.
- Reuse existing GSC connection/service, project key pages, Growth Run/Signal
  services and immutable Insight/Recommendation writers. Do not call Google,
  DataForSEO or an LLM directly.
- Capture the most recent 28 complete GSC calendar days, ending three Pacific
  calendar days before the server clock. There are no caller-selected dates.
- Use one stable cadence slot per source end date. Concurrent/repeated scans for
  the same project/window claim or replay one Run; different caller keys cannot
  create duplicate same-window graphs.
- Query one bounded final GSC page cohort (`dimensions: ["page"]`, row limit
  1,000, no pagination) and intersect it with canonical project key pages.
- Before saving each candidate, apply the exact-page suppression precedence
  table below. The detector result and suppression input are fixed before the
  first graph write.
- Save eligible Signal/Insight/Recommendation graphs while the Run is running,
  set the analysis-template version, then terminalize it. A 1,000-row source
  response completes with errors and an explicit incomplete-source message
  after preserving eligible observed candidates; it never claims an all-clear.
- Provider/validation failure safely fails the claimed Run. Graph-generation
  failure safely fails it. A replay never recollects or rewrites.

## 3. Saved opportunity feed

- Add a read-only `GrowthOpportunityFeedService.getFeed(projectId, {limit})`
  over saved Recommendations created by the accepted detector/template
  versions. It makes no provider call and writes nothing.
- Return proposed, snoozed, and accepted-without-Action Recommendations from
  terminal completed/completed-with-errors Runs, ordered by priority
  descending, creation time descending, then SQLite BINARY/PostgreSQL C ID.
- Read cap-plus-one (default 10, maximum 20) and return `hasMore`; do not claim a
  project-wide total.
- Each item contains safe title/rationale/category, component scores/status,
  canonical safe URL target, ordered safe investigation steps, and the source
  striking-distance Signal facts/window/capture time. Exclude raw evidence
  refs, creation/fact hashes, model/prompt/cost/failure metadata and review
  internals.
- The feed is `current_saved_state_not_historical`: its originating
  Run/Signal/Insight/Recommendation facts are immutable, but current review
  status and Action existence are not reconstructed as-of.

# Saved-work suppression precedence

Evaluation is per canonical Growth exact URL at one server `asOf`. The first
matching row wins:

| Precedence | Saved state               | Suppress as                 | Exact rule                                                                                                                                                                                                                                                                           |
| ---------- | ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1          | Active Measurement        | `active_measurement`        | Any active Plan whose linked Action targets the URL, regardless of current Action state/integrity.                                                                                                                                                                                   |
| 2          | Operational Action        | `operational_action`        | Any URL-targeted Action in `approved`, `ready`, `in_progress`, `blocked`, `implemented`, or `measuring`. Mixed terminal/operational Actions suppress.                                                                                                                                |
| 3          | Unresolved Recommendation | `unresolved_recommendation` | Any URL-targeted `proposed` or `snoozed` Recommendation, or `accepted` Recommendation with no Action of any status. A revived snooze is `proposed` and suppresses. Accepted Recommendations with any Action do not independently suppress; precedence 1/2 decides from related work. |
| 4          | Dismissal cooldown        | `dismissal_cooldown`        | Latest URL-targeted dismissed Recommendation has non-null `reviewedAt` on or after `asOf - defaultCooldownDays`. With cooldown zero, only a dismissal at the exact `asOf` can suppress. Related active work would already win above.                                                 |
| 5          | None                      | eligible                    | Terminal-only Actions (`evaluated`/`cancelled`), expired dismissals, merged/superseded Recommendations, and accepted Recommendations whose only Actions are terminal do not suppress.                                                                                                |

All rows must be project-scoped and created at or before `asOf`; active Plans
must also be created by `asOf`. Review timestamps after `asOf` are invalid for
this decision and ignored. Aggregate existence/latest-review queries operate
only on the at-most-100 canonical candidate URLs and return at most one state
row per URL; no candidate-by-candidate N+1 or unbounded history load is allowed.

# Existing code to reuse

- `GscService.getPerformance` and established final-data date semantics.
- `ProjectContextRepository.listKeyPages` and Growth exact-URL normalization.
- `GrowthSettingsService` for dismissal cooldown.
- `GrowthRunsService`, `GrowthInsightsService` and their normalized graph
  writers/idempotency rules.
- Existing Recommendation/Action/Measurement target relations.
- Growth Evidence Packet safe text/URL projectors.
- D1/PostgreSQL provider abstraction and BINARY/C ordering helpers.

# Data, privacy and identity boundary

- The authorized canonical page URL, including its host, is intentionally part
  of the saved Recommendation target and feed output. “No raw domain” means no
  separate project-domain, GSC property, account or provider-identity field is
  exposed.
- Candidate URLs are validated against the project domain before suppression
  or persistence. Query and fragment are removed by the existing Growth exact
  URL identity. Multiple GSC source variants mapping to one key page are
  rejected as ambiguous rather than merged silently.
- GSC rows are validated for finite non-negative clicks/impressions, CTR 0-1,
  non-negative position, one page key and the requested source window.
- The scan uses no OpenSEO/DataForSEO credits and no LLM. It does write only
  when explicitly called as `runScan`; the feed read never calls it.
- Saved public feed output excludes organization IDs, standalone raw domain,
  GSC property/account/connector identity, quotas, secrets, raw evidence refs,
  dismissal reasons, owners/actors, internal IDs beyond Recommendation/Signal
  identity, hashes and provider failure text.

# Implementation sequence

1. Add detector/template schemas and pure tests for thresholds, bands,
   provenance determinism, URL ambiguity and no-causality language.
2. Add bounded project-leading suppression queries plus D1 and live PostgreSQL
   truth-table fixtures.
3. Add the explicit scan service and tests for stable window slot, replay,
   source cap, failure terminalization, suppression and graph persistence.
4. Add the saved feed repository/service/strict DTO and D1/PostgreSQL/service
   tests for state predicates, bounds, ordering, projection and isolation.
5. Update the Growth ADR and implementation plan to record this prerequisite;
   do not mark BG-0606 implemented.
6. Run focused, full and live-PostgreSQL checks; obtain fresh full review and
   final acceptance. Only a later, separate run may plan BG-0606.

# Explicit non-goals

- MCP/SAM registration, route, server function, UI, scheduler or public scan
  trigger.
- GA4 enrichment, non-curated pages, query-level candidates, DataForSEO, ranks,
  audits, backlinks, AI visibility, SERP research or LLM analysis.
- Implementing a general detector framework or changing database schema.
- Accept/dismiss/snooze UI, Action creation, cross-project/cross-portfolio feed,
  historical snapshot API or exhaustive pagination.
- Treating a candidate as a diagnosed change, promising uplift, or claiming
  source completeness when GSC returns the row cap.

# Verification plan

- Pure tests: threshold edges, all suppression reasons, impact/urgency/
  commercial bands, deterministic evidence hashes and ordering, malformed/
  duplicate/out-of-project source rows, uncalibrated language.
- D1/live PostgreSQL suppression tests: every precedence-table row, mixed
  Actions, active Plan with mismatched/terminal Action, accepted-with-terminal
  Action, revived snooze, future review, zero/active/expired cooldown and
  foreign-project rows.
- Scan service tests: auth-independent trusted input boundary, no connection/no
  key pages, fixed window, one GSC call and request shape, cap disclosure,
  idempotent same-window replay, observed-only candidates, graph writes and
  safe failed/completed-with-errors states.
- Feed D1/live PostgreSQL/service tests: terminal-run filter, unresolved states,
  accepted-with/without Action, filter-before-limit, cap-plus-one, BINARY/C
  ties, safe full item projection, no raw evidence/provider/internal fields.
- Run focused tests, `pnpm ci:check`, full tests, production build and staged
  whitespace checks. Browser, HTTP, CDP, Playwright and screenshots remain
  prohibited and unclaimed.

# Risks

- Signal baseline can be mistaken for a temporal baseline. The metric name,
  ADR and feed label it as a materiality-threshold comparison.
- Position averages and discrete bands can look more certain than they are.
  The Recommendation is explicitly an investigation, uses uncalibrated 0.5
  confidence and exposes components rather than an opaque score.
- Concurrent scans can duplicate cross-run work. Stable one-window cadence
  claims and pre-write exact-page suppression contain this version-1 risk.
- Current state may change between suppression and graph writes. This run does
  not add a cross-aggregate transaction or uniqueness constraint; the single
  same-window run claim prevents parallel writers for the same window, and a
  later-window race remains a documented residual risk for scheduled scans.
