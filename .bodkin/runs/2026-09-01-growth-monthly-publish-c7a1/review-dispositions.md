# Review 1 dispositions

- **Valid — ambiguous failure lock:** retain the frozen publication and shared
  operation lock after an error. Release only on authoritative publication
  success/recovery or pre-dispatch Cancel.
- **Valid — ADR contradiction:** remove `publication UI` from ADR-035's deferred
  list without pulling any future sharing/history/correction work into scope.
- **Valid — verification gaps:** repair the DTO fixture, format the complete
  change and rerun types plus all required repository gates.
- **Director-added valid boundary:** keep the snapshotted confirmation visible
  and actionable if query cache data changes before Confirm; the original
  coordinate alone must dispatch. An unresolved post-dispatch failure must not
  expose Cancel or otherwise abandon its lock.
- **Director-added valid evidence gap:** complete the acceptance-mandated
  coordinator source-pruning/rollover tests and UI confirmation, focus,
  authoritative success, exact check/retry, retained-lock and published-state
  tests. The initial implementation's 41 passing tests do not cover these
  required branches.
- **Director-added UX repair:** place the inline publication action before the
  long eight-section report so it is discoverable next to the report state,
  while leaving `GrowthReportView` read-only and reusable.

Preserve every `do_not_change` invariant in `review-1.json`.
