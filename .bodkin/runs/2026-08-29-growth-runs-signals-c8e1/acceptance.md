# Required behaviour

- ADR-022 defines inclusive period semantics, cadence-slot idempotency, run lifecycle, Signal immutability and the bounded evidence-reference contract without introducing duplicate upstream data.
- A trusted internal service can create a manually triggered, immediately running Growth run for an existing project with type, stable cadence slot, inclusive period and version metadata.
- Retrying identical project/type/slot creation returns the same run; changed immutable input for that occupied slot fails with `CONFLICT`; the same type/slot remains valid in another project.
- A running run can end exactly once as `completed`, `completed_with_errors` or `failed`, with server timestamps, nullable non-negative provider cost, and bounded failure metadata where required.
- Missing/foreign runs behave identically as `NOT_FOUND`; terminal or raced transitions fail as `CONFLICT` and cannot overwrite terminal history.
- A running run can record a deterministic Signal containing entity/metric coordinates, scalar baseline/current/delta values, inclusive period, severity, confidence, capture time and one typed stable evidence reference.
- Identical Signal retries return the original row; a conflicting fact for the same deterministic identity fails without mutating the original.
- Signal reads and writes are project/run scoped, and the database rejects a Signal whose project does not own its run.
- Deleting a project cascades through its Growth runs and Signals without affecting another project's records.
- D1/SQLite and Postgres schemas/migrations expose equivalent columns, closed vocabularies, checks, unique keys, composite project/run FK and cascades.

# Required checks

- Zod tests cover valid calendar dates, inclusive/reversed periods, bounded strings, nullable/non-negative costs, confidence and evidence vocabulary.
- Service tests cover manual creation, exact idempotency, occupied-slot drift, project isolation, terminal transitions, bounded failure storage and Signal retry/drift behavior.
- A migration-backed real-libSQL test proves natural-slot uniqueness, same-slot cross-project isolation, composite-FK rejection, terminal/check enforcement, project cascade and a clean `PRAGMA foreign_key_check`.
- `src/db/schema-parity.test.ts` passes with both tables and matching provider definitions.
- Both migration trees are generated, inspected and the D1 migration is executed against the prior checked-in schema.
- Full root tests, `ci:check`, application build and `git diff --check` pass.
- Fresh adversarial review returns pass or every accepted finding is repaired and reverified within two rounds.

# Regression constraints

- Existing Growth settings/key-page behavior, migrations and tests remain green.
- No external surface accepts a caller-supplied project identity in this slice; future boundaries must still derive it from existing authorization.
- Existing rank/audit run models, provider metering and scheduling remain unchanged.
- Historical Signal facts and evidence are never updated in place; tenancy deletion remains the only cascading removal.
- No dependency, paid call, production migration or remote state is introduced.

# Important edge cases

- Start and end may be the same valid calendar day; an impossible date or start after end fails.
- Same cadence slot in two projects creates two independent runs; same project/type/slot does not.
- Explicit provider cost `0` is preserved; absent cost remains null; negative/non-integer cost fails.
- `completed_with_errors` and `failed` require both a bounded code and message; ordinary completion rejects failure metadata.
- Confidence accepts 0 and 1 and rejects values outside that range.
- A lookalike project/run pairing is rejected by the database even if both IDs independently exist.
- Signal identity retries with different numeric values, severity, confidence, capture time or evidence reference do not overwrite stored facts.

# Product / UX requirements

None. UI and public/API surfaces are explicitly deferred.

# Specialist review requirements

None. Fresh full-scope engineering review is required.
