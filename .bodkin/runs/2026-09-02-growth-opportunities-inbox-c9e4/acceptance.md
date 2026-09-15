# Acceptance

## Outcome

BG-0208A is complete for the accepted boundary. The Growth page now has a
project-level Opportunities section directly below Monthly summary. It composes
the existing saved unresolved Recommendation read model, exposes only the
minimal controller Signal identity needed by the existing investigation review
path and leaves the MCP contract unchanged.

## Required behaviour

1. The server function replaces the submitted project echo with authenticated
   project context. Root, child and controller-source reads remain
   project-leading, and D1 plus live PostgreSQL tests exclude foreign data.
2. Membership, order, sanitization, child caps and cursor semantics come from
   `GrowthPriorityRecommendationsReadService` without a duplicate feed query.
3. The strict app-only wrapper preserves the safe Recommendation DTO and permits
   only nullable `{ signalId }` review source. Run IDs and raw relationships are
   rejected by schema coverage and never serialized.
4. The source repository returns only emitted Recommendation IDs whose link is
   a current unreleased controller. Suppressed, released, foreign and
   unrequested links do not grant review access.
5. Proposed and snoozed cards lazy-load the existing qualified investigation
   disclosure. Viewing or refreshing the inbox performs no provider call or
   write. Legacy/no-source cards remain readable without read-time adoption.
6. Accepted-without-Action cards are explicitly read-only even when a
   controller Signal exists; they never render approval or review controls.
7. Approval, dismissal, snooze and Review now invalidate the shared
   priority-Recommendation query. Approval also refreshes Work and project
   summary membership.
8. The section has labelled loading, fetching, retryable failure, empty and
   top-page-overflow states. Detail rendering discloses redacted, truncated,
   omitted and withheld safe projections.
9. `View opportunities` resolves to the unique labelled section before the
   manual priority-page detector surface.

## Architecture boundary

- No dependency, migration, provider call, credit, AI/LLM, detector, schedule,
  alert, Measurement, report, Action model, auth system or database was added.
- No MCP schema or tool changed. Exporting the existing safe item schema only
  permits app-side composition; its fields remain unchanged.
- Interactive pagination, generic discovery, full history, legacy repair and
  controller release remain deferred.

## Evidence

- Fresh plan review passed after removing Run identity from the browser DTO and
  making accepted-without-Action eligibility explicit.
- Fresh implementation review found the missing PostgreSQL client context and
  direct interaction-test gap; both were repaired.
- Fresh post-repair review passed with no critical, major, minor, verification
  or plan findings.
- Focused tests, a live PostgreSQL 16 test, repository CI, the full one-worker
  suite and production build all pass. Exact commands and counts are in
  `verification.json`.

## UI evidence boundary

Browser, Playwright, dev-server, screenshot and responsive visual evidence were
prohibited for this session. Acceptance covers semantic markup, safe display
copy and interaction dispatch verified by static tests. It does not claim
pixel-level or responsive visual quality.
