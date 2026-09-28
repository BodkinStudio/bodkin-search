# Required behaviour

1. Only a supported saved priority-page investigation from the authorized
   project can be reviewed through the new application boundary. The input
   project never overrides authenticated context.
2. The strict public decision union permits only dismiss with a closed reason,
   snooze with a calendar date or Review now. Callers cannot submit arbitrary
   Recommendation status or review metadata.
3. The service derives proposed-to-dismissed, proposed-to-snoozed and
   snoozed-to-proposed transitions, then delegates legality, future-time
   validation, expected-version CAS and exact replay to the existing
   Recommendation service.
4. A new snooze stores UTC start of day and must be future. Exact persisted
   replay remains valid after time passes. A definitive validation rejection
   unlocks correction; uncertain failures retain the exact frozen payload.
5. Approval remains the existing separately audited transaction that accepts
   the Recommendation and creates one complete Action, target and event graph.
   Concurrent approval and proposed review allow exactly one winner.
6. The card receives only the strict displayed investigation projection. Run,
   relationship, actor, resolution, hash and future repository fields remain
   internal.
7. Proposed, dismissed, snoozed, merged, superseded, accepted and legacy
   accepted states have explicit controls or read-only copy. Native inputs are
   labelled and required, UTC is named, pending operations lock every decision
   and no render, reload or refetch dispatches a mutation.
8. The slice introduces no dependency, migration, provider, credit, schedule,
   Measurement, MCP, SAM, separate service, database or auth system.

# Required checks

- Focused schema, service, server-function, static-render and submission tests
  pass with the existing review and query regressions.
- A freshly migrated disposable PostgreSQL 16 database proves both
  approval-versus-review races and Review-now Action exclusion.
- `pnpm ci:check`, the full one-worker suite, production build and staged plus
  unstaged whitespace checks pass under the 4 GB Node heap cap.
- Fresh adversarial review passes after the bounded repair, followed by
  Director acceptance.

# UI evidence boundary

This is a local non-material patch over the existing disclosure, card and
native-form composition. Semantic markup and dispatch behavior are verified by
tests. Browser, screenshot, responsive-layout and visual-quality evidence were
prohibited in this session, so acceptance makes none of those claims.
