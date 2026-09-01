# Required behaviour

1. A project-authorized user can finalize an active Measurement from Work and
   receives the authoritative completed Work overview.
2. The client contract is strict and contains only project routing, Action ID,
   expected Action version, review revision, outcome, confidence, summary and a
   bounded Change Event ID array. Project/actor authority and Plan/provenance
   coordinates are server-derived.
3. Finalization delegates to `GrowthMeasurementsService.finalizeMeasurement`;
   it never writes the repository directly and never calls a provider.
4. Review availability uses the Plan's frozen report timezone and becomes true
   only when the calendar date is strictly after the final inclusive window.
5. Ordinary outcomes require complete baseline, primary and configured
   long-term evidence for every primary Metric. Missing secondary evidence does
   not block. `not_measurable` may close incomplete evidence only after the
   window completes.
6. The review revision is a bounded deterministic SHA-256 state coordinate that
   the server independently recomputes from canonical project, Plan, Action
   version, Observation hash, discovery state and deterministically ordered
   complete candidate IDs. It is never parsed or treated as authentication. A
   malformed, substituted, cross-coordinate or stale revision conflicts.
7. The human path supplies the exact reviewed Observation hash to the core
   writer boundary. An Observation change before or during finalization
   conflicts without freezing unseen evidence.
8. Existing callers without the human expected-evidence option keep the core's
   single Observation-race retry. The human path does not.
9. Confounder candidates remain advisory. The UI never preselects them; the
   revision detects a changed complete list at mutation preflight, while the
   core validates selected IDs as same-project and excludes the anchor. The
   Result does not claim that unselected candidate discovery was serialized
   through commit.
10. An exact lost-response retry preserves the original Plan version, normalized
    payload and server actor provenance and returns the existing Result after
    Work is Evaluated. Any outcome, confidence, summary, actor, confounder or
    version drift conflicts.
11. The inline form starts blank, uses labelled native controls and an accessible
    disabled fieldset, explains outcome distinctions and confidence semantics,
    and warns immediately before submission that the result is immutable,
    observational and transitions Work to Evaluated.
12. Confidence is entered as an integer percentage from 0 through 100 and sent
    as 0 through 1. No default, suggested value, automatic score or threshold is
    introduced.
13. Pending or ambiguous finalization freezes the exact request, reviewed
    candidate and measurement presentation across component remounts, prevents
    double dispatch, normal refresh, collection and automatic measurement reads
    on mount/reconnect/focus, disables automatic mutation retry, and offers only
    exact retry or an authoritative saved-result check.
14. Success applies only non-older measurement/Work state, invalidates Work and
    history, and renders the completed Result without exposing raw errors.
15. Result summaries and surviving selected confounder descriptions/URLs pass
    existing safe presentation boundaries. The terminal empty state says only
    that no linked confounder record is currently available; it does not claim
    none was ever selected.
16. Existing start, collection, comparison, discovery and completed Result
    behaviour remains stable.

# Required checks

- Schema/server-function tests reject browser Plan IDs, actors, notes, model or
  prompt provenance, hashes, observations, timestamps and unknown fields.
- Domain/Work tests cover exact timezone transition, missing primary versus
  secondary evidence, not-measurable escape, malformed/tampered/cross-project/
  cross-Action/stale review revisions, preflight complete-candidate drift,
  Observation drift before and during the writer, same/different concurrent
  Result winners, same-project/anchor confounders and provider-free
  orchestration.
- Form/server-render tests cover all labels and helper copy, blank defaults,
  validation, candidate checkbox semantics, safe narrative output, review
  states and surviving/empty completed confounders.
- Submission tests cover no mutation on render/refetch/remount, one dispatch,
  79% to 0.79 conversion, frozen remount and exact retry, suppression of stale
  automatic reads during recovery, authoritative recovery, failed recovery
  lock, synchronous collection/finalization exclusion, equal-version evidence
  preservation, monotonic caches and scoped invalidations.
- `pnpm ci:check`, `pnpm test:ci`, `pnpm build`, `git diff --check` and staged
  whitespace pass.
- A fresh reviewer returns pass or every valid finding is repaired and
  reverified within two rounds.

# Regression constraints

No database, dependency, provider, auth middleware, scheduler, MCP, generic
Action transition, Measurement writer or unrelated UI changes.

# Important edge cases

- The exact local-calendar transition after due date in a non-UTC timezone.
- Zero confidence and 100% confidence.
- Neutral versus inconclusive versus not measurable.
- No candidate, one candidate, changed complete candidate list, overflow and
  unavailable legacy discovery.
- A newly committed Observation after review but before the writer lock.
- Identical and differing concurrent human finalizations.
- Lost successful response after Work has already become Evaluated.
- Selected confounder deletion before commit and surviving-link deletion after
  completion.
- Long descriptions, recognised credentials and credential-bearing URLs.

# Product / UX requirements

- Keep the existing lazy Work measurement disclosure and compact visual
  hierarchy; add no modal, route or new global primitive.
- Place review after the observed comparison and possible-confounder context.
- Use `Finalize measured result`; do not use causal or success-verdict styling.
- Explain that strong/ordinary outcomes are human judgements, not automatically
  derived thresholds.
- Keep final selected confounder records separate from current candidate
  discovery.

# Specialist review requirements

- Follow the already selected native accessibility guidance: semantic headings,
  fieldsets, labels, descriptions, inline errors, status/alert roles and no
  colour-only state.
- Browser evidence is waived only because of the user's explicit restriction;
  server-render and interaction tests must provide mechanical UI evidence.
- Fresh review must challenge authority boundaries, reviewed-evidence binding,
  exact retry, candidate advisory semantics, cache monotonicity, safe narrative
  projection and non-causal wording.
