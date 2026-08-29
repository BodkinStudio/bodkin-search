# Required behaviour

- ADR-023 records the approved immutable Insight/Recommendation graph, same-run source policy, target/step normalization, fact-hash idempotency and Recommendation review lifecycle.
- A trusted internal service can create an immutable Insight for a running Growth run from one or more existing Signals owned by the same project and run.
- A trusted internal service can create a `proposed` Recommendation for a running run from one or more Insights in that project/run, one or more normalized targets and one or more ordered proposed steps.
- Caller-stable keys are unique within project/run. Exact creation retries return the original complete graph; changed content or child coordinates for an occupied key fail with `CONFLICT` and never mutate or extend the stored graph, including concurrent drift.
- Insight content/source links and proposed Recommendation content/source/target/step rows have no update/delete application methods.
- URL/site targets are canonical and within the project domain; keyword/cluster targets use non-empty collapsed lowercase whitespace. Duplicate canonical targets or source IDs are normalized deterministically.
- Recommendation scoring bands enforce impact/commercial relevance/effort `1..5`, urgency `1..3`, confidence `0..1`, and finite non-negative priority score.
- Recommendation review is project-scoped, versioned and compare-and-set: `proposed` may become accepted/dismissed/snoozed/merged/superseded, and snoozed may return to proposed. Exact decision replay is idempotent; raced/stale/different/illegal decisions conflict or validate without overwriting history.
- Dismissal requires a PRD dismissal reason; a new snooze requires a future timestamp, while an exact persisted snooze replay remains idempotent after expiry; merge/supersede requires a non-self Recommendation in the same project and run. Other states reject incompatible metadata.
- Missing and foreign parents behave identically as `NOT_FOUND`. Database constraints reject cross-project and cross-run source/link attachment.
- Deleting a project cascades the new graph without affecting another project; deleting a run cascades its Insights/Recommendations and normalized children.
- D1/SQLite and Postgres schemas/migrations expose equivalent columns, checks, keys, composite FKs and cascades.

# Required checks

- Zod tests cover bounded content, finite scores, source/target/step cardinality, model/prompt pairing, dismissal vocabulary, snooze/resolution metadata and canonical target input.
- Service tests cover exact retry, immutable drift, source validation, target normalization/domain rejection, project isolation, every legal review outcome, illegal/stale/raced review and exact replay.
- A migration-backed real-libSQL test starts from migration 0044 with populated Signals, proves existing rows survive, exercises cross-project/run composite FKs, uniqueness/checks/cascades and ends with a clean `PRAGMA foreign_key_check`.
- Provider-gated Postgres evidence applies the generated migration and exercises actual repository graph creation/locking.
- `src/db/schema-parity.test.ts`, full root tests, `ci:check`, production build and `git diff --check` pass.
- Fresh adversarial review returns pass or every accepted finding is repaired and reverified within two rounds.

# Regression constraints

- Existing Growth settings, key pages, runs, Signals, provider cost and terminal concurrency behavior remain green.
- No caller-supplied project identity crosses an external boundary in this slice; future surfaces must derive project scope from current authorization.
- Existing auth, MCP, rank/audit models, scheduling, provider metering and upstream source snapshots remain unchanged.
- No dependency, paid call, production migration or remote state is introduced.

# Important edge cases

- Duplicate/reordered source IDs and targets canonicalize to one deterministic graph; duplicate steps are allowed only at distinct ordered positions.
- Same caller key in two projects or two runs remains independent.
- A Signal/Insight ID that exists in another run or project is rejected rather than silently omitted.
- A running-run creation that loses to a terminal transition inserts nothing; a creation that wins commits its complete graph before the terminal state.
- A concurrent exact retry is harmless; concurrent drift cannot attach its losing source, target or step rows.
- Confidence accepts 0 and 1; priority accepts 0; non-finite values fail.
- A merged/superseded destination cannot be self, foreign-project or foreign-run. Accepted/dismissed/merged/superseded are terminal for this slice.

# Product / UX requirements

None. UI and public/API surfaces are explicitly deferred.

# Specialist review requirements

None. Fresh full-scope engineering review is required.
