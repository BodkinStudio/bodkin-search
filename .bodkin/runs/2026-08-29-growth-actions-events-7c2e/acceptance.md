# Required behaviour

- ADR-024 records the approved Action aggregate, exact lifecycle, immutable event ledger, provenance, idempotency and deletion policy.
- A trusted internal service creates an `approved` Action only from an `accepted` Recommendation owned by the same project; missing, foreign or non-accepted sources fail without inserting anything.
- One Recommendation can create multiple Actions. Caller-stable creation keys are unique within a project. Exact retries return the original complete Action/target/creation-event graph; changed immutable facts or event metadata conflict and never extend the stored graph, including under concurrency.
- Each Action requires bounded title/description, an ISO due date, an actor and at least one canonical target drawn from its Recommendation. Category and finite non-negative priority are inherited from the source Recommendation. Owner remains null in this internal slice.
- URL/site and keyword/cluster targets use the same canonicalization as Recommendations. Duplicate/reordered targets normalize deterministically; foreign or invented target coordinates are rejected.
- Actions begin `approved` at version zero with one immutable `created` event (`null → approved`). Every legal transition atomically increments the projection version and appends exactly one `status_changed` event at that version.
- Legal transitions are: `approved → ready | cancelled`; `ready → in_progress | cancelled`; `in_progress → blocked | implemented | cancelled`; `blocked → in_progress | implemented | cancelled`; `implemented → measuring`; `measuring → evaluated`. `evaluated` and `cancelled` are terminal.
- Transition writes are project-scoped compare-and-set operations over expected status/version. Exact replay returns the existing state/event; different metadata, stale versions, illegal transitions and lost races conflict without changing either table.
- `started_at`, `implemented_at`, `evaluated_at` and `cancelled_at` record first entry into their milestones and are not overwritten. `implemented` remains distinct from `evaluated`.
- Events are append-only, ordered by Action version, and carry bounded actor type/ID, optional note, from/to status, fact hash and occurrence timestamp. No application update/delete method exists for targets or events.
- Database constraints reject cross-project Recommendation, target and event attachment, invalid status/event vocabulary, fractional/negative versions, malformed event shapes and duplicate versions.
- Project, Recommendation and origin-run deletion cascade through the Action aggregate without affecting another project/run. D1/SQLite and Postgres expose equivalent structures and behavior.

# Required checks

- Zod tests cover text/date/actor bounds, target/status vocabularies, cardinality, versions and incompatible transition coordinates.
- Service tests cover accepted-source creation, multiple Actions per Recommendation, exact retry/drift, target normalization/subset rejection, project isolation, every legal/illegal transition, blocked recovery, terminal immutability, milestone preservation, exact event replay and CAS races.
- A migration-backed real-libSQL test starts from migration 0045 with populated accepted Recommendations, applies the new migration, exercises raw checks/composite keys/cascades and ends with a clean `PRAGMA foreign_key_check`.
- A real-libSQL repository test exercises production Drizzle/runBatch aggregate creation and state/event atomicity.
- Provider-gated Postgres evidence applies the complete migration tree and exercises actual repository creation plus concurrent transition retry/drift behavior.
- `src/db/schema-parity.test.ts`, full root tests, `ci:check`, production build and `git diff --check` pass.
- Fresh adversarial review returns pass or every accepted finding is repaired and reverified within two rounds.

# Regression constraints

- Existing Growth settings, key pages, runs, Signals, Insights, Recommendations, review lifecycle, provider cost and terminal concurrency remain green.
- No caller-supplied project identity crosses an external boundary in this slice; future surfaces derive scope from current authorization.
- Existing auth, MCP, rank/audit models, scheduling, provider metering and upstream source snapshots remain unchanged.
- No dependency, paid call, production migration or remote state is introduced.

# Important edge cases

- Same creation key in two projects remains independent; two different keys may create two Actions from one Recommendation.
- A target that canonicalizes correctly but is absent from the source Recommendation is rejected.
- A concurrent exact retry is harmless; concurrent creation or event drift cannot attach its losing target/event metadata.
- Blocked/resumed cycles create distinct monotonically versioned events even when the current status repeats a prior status.
- Generated occurrence timestamps and milestone times do not enter semantic retry hashes; exact delayed retries return the stored winner.
- Deleting a run with accepted Recommendations and Actions cascades its complete graph; another run/project survives.

# Product / UX requirements

None. UI and public/API surfaces are explicitly deferred.

# Specialist review requirements

None. Fresh full-scope engineering review is required.
