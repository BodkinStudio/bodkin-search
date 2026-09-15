# Director disposition: not accepted

Follow-up authorization: the user replied “okay keep going” to the proposed focused reliability fix. Run `2026-08-30-growth-atomic-approval-8c2e` owns that revised atomic approach and both-provider verification. This run remains an accurate record of the escalation and is not reset or silently marked accepted.

The authorized follow-up subsequently passed the real SQLite/D1 and Postgres checks, CI/build and fresh independent repair review. Its `final-acceptance.md` resolves the approval-fact and Postgres evidence findings below. The original historical verdict here remains unchanged.

## Interrupted approval facts — valid, blocking

The review is correct. The accepted recommendation does not durably capture an approver or due date. The Action owns those facts only after its creation succeeds. Freezing the date in component state and rejecting drift against an existing Action does not protect an accepted-without-action approval after reload. The successful UI recovery used the same actor/date by choice; it did not prove that a different retry would be rejected.

The current happy path and the tested persisted-action replay are working. They are not enough to accept the complete retry requirement. No third automatic repair is being started: the Bodkin engineering workflow's two-repair cap has been reached, and the run is escalated rather than marked complete or reset under a new run ID. The current feature remains uncommitted pending direction.

Recommended bounded follow-up: reuse the existing provider-aware `runBatch` to make recommendation acceptance, Action creation, targets and the creation event one atomic operation. Keep server-derived content/targets/identity and existing graph validation. Prove rollback on interruption, concurrent approvers, date/actor replay and both provider paths. Do not add a new database/auth/service; if the atomic composition requires a schema change, document that concrete need before implementing it. Previously accepted-without-action records need an explicit recovery policy because their original actor/date cannot be reconstructed.

The existing `.greptile/config.json` rule `atomic-multi-write` already says partial completion that violates an invariant must use `runBatch`; no new review-control rule is needed or added.

## Postgres execution — valid evidence gap

The implementation is intended to remain provider-compatible and makes no schema changes. Actual evidence in this run is SQLite/D1 only; six optional Postgres tests were skipped. The planning notes disclosed that limitation, but that disclosure does not establish the new grouped query on Postgres. The follow-up should exercise the new Work projection and atomic approval using the repository's opt-in disposable Postgres test convention. Do not claim both-provider execution until it has run.

## UI review — pass

The separate fresh rendered review passed with no findings. Preserve its `do_not_change` items in `ui-review.json`. That visual pass does not override the unresolved backend approval boundary.
