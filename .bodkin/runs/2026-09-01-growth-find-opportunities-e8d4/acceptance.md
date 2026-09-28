# Acceptance criteria

1. This run implements only the deterministic saved opportunity-feed
   prerequisite. No `growth_find_opportunities` MCP/SAM tool, route, public scan
   trigger, UI or scheduler is added, and BG-0606 remains unimplemented until a
   separate accepted run.
2. A strict version-1 pure detector accepts captured final GSC page facts and
   curated key pages, validates project/domain/window/source coordinates, and
   emits candidates only for observed exact key pages with at least 100
   impressions and average position 4-15. Non-curated, missing, malformed,
   ambiguous, out-of-project and non-material rows never produce candidates.
3. Each candidate's deterministic Signal compares observed impressions to the
   explicit 100-impression rule threshold; the evidence digest covers every
   semantic source/rule coordinate. Signal confidence 1 is labelled rule
   qualification only, not diagnosis/uplift confidence.
4. The rule-based Insight/Recommendation is an investigation, not a prescribed
   website change. Impact uses documented impression bands, commercial
   relevance uses curated 1-5 weight with null→1, urgency uses documented
   position bands, effort 1 means investigation effort, confidence is the
   explicit uncalibrated 0.5 convention, and provisional priority follows the
   documented PRD formula. Generated prose makes no causal or uplift claim.
5. `GrowthOpportunityScanService.runScan({projectId})` is an explicit internal
   mutation. It derives the fixed latest 28 complete Pacific/GSC days, claims
   one stable project/window Run, reads at most 1,000 final GSC page rows once,
   and replays same-window calls without recollection or rewrites. No arbitrary
   dates/caller key can bypass that identity.
6. The scan uses existing GSC, project-context and Growth graph services. It
   makes no direct provider/DataForSEO/LLM call and consumes zero OpenSEO
   credits. Missing setup is rejected before claim where possible; provider or
   generation failures safely terminalize a claimed Run.
7. A 1,000-row GSC response is treated as potentially capped: eligible
   observed candidates may be persisted, but the Run completes with errors and
   a bounded incomplete-source message. Missing pages are never treated as
   zero and no all-clear/project-completeness claim is emitted.
8. Exact-page saved-work suppression implements the plan's full precedence
   table. Active Measurement beats operational Action, which beats unresolved
   Recommendation, which beats active dismissal cooldown. All mixed/multiple
   Action, accepted-with/without-Action, snooze/revival, terminal-only,
   future-review and zero/expired cooldown cases match the table on D1 and
   PostgreSQL.
9. Suppression queries lead with project ID, use only candidate canonical URLs,
   filter timestamps before aggregation, return at most one state per URL and
   do not perform N+1 or unbounded history reads. Foreign-project work cannot
   suppress or appear.
10. Eligible graphs are written only while the claimed Run is running, use the
    existing immutable/idempotent writers, set the exact analysis-template
    version and terminalize once. The detector result and suppression facts are
    fixed before the first graph write. Same project/window concurrency cannot
    create two Runs/graphs.
11. `GrowthOpportunityFeedService.getFeed` is a separate saved-data-only,
    zero-credit, read-only service. It never calls the scan or a provider. It
    reads only Recommendations from accepted detector/template versions and
    terminal completed/completed-with-errors Runs.
12. The feed returns proposed, snoozed and accepted-without-any-Action items;
    accepted Recommendations with an Action and all terminal review states are
    excluded before limiting. Default 10/max 20 cap-plus-one results are sorted
    by priority descending, creation time descending, then provider-equivalent
    code-unit ID, with truthful `hasMore` and no total claim.
13. Each feed item contains only safe Recommendation title/rationale/category,
    scoring components/status, one authorized canonical safe URL, ordered safe
    investigation steps, and source striking-distance Signal facts/window/
    capture time. The canonical page URL including host is intentionally
    public; standalone project/GSC/provider identity is not.
14. Feed DTO/schema and projection exclude unknown/private fields, raw evidence
    refs, creation/fact hashes, models/prompts/cost/failure data, review reasons,
    snooze resolution internals, owners/actors, secrets, quotas and account/
    property/connector identity. Narrative and URL safety reuse established
    Growth projectors.
15. The result explicitly says `current_saved_state_not_historical`. Immutable
    origin facts stay auditable, while current review/Action predicates are not
    represented as an atomic or historical snapshot.

# Required checks

- Strict schema, pure detector/template, scan service and saved-feed service
  tests pass.
- D1 and required live PostgreSQL suppression/feed repository tests pass.
- Existing priority-page check, Growth graph, project summary/page context and
  Recommendation review behavior remains green.
- `pnpm ci:check`, full tests, production build and staged whitespace checks
  pass.
- Growth ADR/implementation plan document the saved-feed boundary and leave
  BG-0606 pending.
- Fresh adversarial full review has no outstanding critical/major finding or
  material verification gap; final acceptance verifies every criterion.
- Browser, HTTP, CDP, Playwright and screenshot verification is not run or
  claimed.

# Specialist review focus

Reviewers must challenge threshold-as-baseline truthfulness, provisional score
certainty, same-window concurrency, saved-state suppression precedence and
bounds, filter-before-limit, project/domain isolation, source-cap handling,
explicit write versus read boundaries, and the absence of premature MCP/SAM
exposure.
