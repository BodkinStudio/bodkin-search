# Goal

Implement the read-only BG-0307A confounder-discovery slice for active Growth
Measurement Plans. Reuse frozen Measurement URLs and existing Change Events to
show a bounded, reviewable list of possible overlapping changes without
creating a Result, assigning confidence or claiming causality.

# Scope

1. Record the version-1 discovery boundary in the Growth ADRs: inspect the full
   frozen comparison interval from baseline start through the final configured
   period, exclude only the selected anchor Event, require exact URL identity,
   include every Change Event source and treat matches as candidates only.
2. Add one project-scoped repository read that returns narrow matching Change
   Event candidates in deterministic order. Read at most 51 candidates so the
   service can distinguish a complete set of at most 50 from overflow without
   silently truncating.
3. Add a pure service projection that derives target URLs and interval solely
   from the verified Measurement graph, reports `complete`, `none`, `overflow`
   or `unavailable`, and exposes bounded exact matched-page evidence with safe
   display URLs and explicit limitations.
4. Extend the existing Work measurement read model and compact disclosure with
   a “Possible confounding changes” section for active Plans. Reading remains
   provider-free and mutation-free.
5. Add focused repository/service/read-model/server-render tests, then run the
   repository CI, full test, production build and whitespace gates.

# Repository evidence

- `GrowthMeasurementsService.finalizeMeasurement` and the Measurement writers
  already freeze explicit confounder IDs and atomically transition a Plan, but
  no production caller discovers or reviews candidates.
- `GrowthChangeEventsRepository` already owns project-leading Event and URL
  reads; `growth_change_events` has project/date and Event URLs have
  project/URL indexes.
- `GrowthWorkMeasurementService` and `GrowthWorkMeasurementProjection` already
  own the authorized, provider-free Work read model.
- ADR-032 deliberately deferred confounder discovery and interpretation after
  the completed BG-0305/0306 collection slice.

# Constraints

- No dependency, schema, auth, provider, scheduler or MCP changes.
- Never use mutable key pages or browser input to select the candidate scope.
- Keep exact frozen URL identity. Do not infer that `/`, a template change, a
  normalized variant or a site-wide Event affects another URL.
- Candidate discovery is not causal classification and does not lower or assign
  confidence automatically.
- No Result write or `measuring → evaluated` transition in this slice.
- Preserve project tenancy, bounded output, deterministic ordering and safe URL
  display/redaction.
- Browser/rendered screenshot evidence is waived by the user's explicit
  browser-tool restriction; server-render tests are the UI evidence.

# Non-goals

- Human or AI interpretation, outcome thresholds, confidence scoring, Result
  finalization, confounder selection/persistence, automatic scheduling,
  site-wide/template inference and historical candidate snapshots.

# Risks and mitigations

- **Silent omissions:** request 51, expose overflow and withhold a misleading
  partial list.
- **Tenant leakage:** lead every query and join with `project_id`; test a foreign
  Event with the same URL/date.
- **False causal certainty:** label every match as possible context, explain exact
  URL/date limitations and avoid success/verdict styling.
- **Calendar drift:** compare canonical Event timestamps to UTC boundaries
  derived from the immutable inclusive Plan dates; test both exact boundaries.
- **Legacy Plans:** do not guess which Event to exclude when no selected anchor
  relation exists; report discovery as unavailable.
- **UI overload:** cap the complete list at 50 and retain the existing compact
  Work disclosure hierarchy.

# Verification approach

- Focused repository/service/read-model/server-render tests for tenancy, anchor
  exclusion, all sources, exact/variant URLs, inclusive boundaries, stable
  ordering, empty and overflow states, legacy/completed Plans and provider-free
  reads.
- `pnpm ci:check`
- `pnpm test:ci`
- `pnpm build`
- `git diff --check` and staged whitespace
- Fresh adversarial review against `acceptance.md`.
