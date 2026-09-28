# Goal

Complete the investigation/work slice by making approval durable and proving the new path on SQLite/D1 and Postgres. The user explicitly approved this focused follow-up after the preceding run escalated; this is not an automatic reset of its repair budget.

# Scope

STANDARD (7): feature-local transaction composition and focused failure/concurrency tests, with no schema, auth, provider or shared database-helper change. The Director implements the known fix directly, using a bounded read-only code check, parallel test work if useful, independent verification and fresh repair-focused review. Preserve the already-reviewed UI layout.

# Relevant areas/files

- GrowthActionsWriter already builds an atomic Action/targets/creation-event graph; Postgres takes a shared lock on its accepted source.
- GrowthActionsService validates normalized target subsets and hashes all immutable Action and creation-event facts.
- GrowthInvestigationsService currently accepts then creates in separate transactions; an accepted recommendation has no actor/due-date fields.
- runBatch provides ordered atomic D1 batches and Postgres transactions using tx-bound builders.
- Existing query/SQLite integration tests and optional Postgres tests provide reusable fixtures and execution conventions.

# Implementation approach

1. Reuse the Action graph builder for a distinct proposed-recommendation approval path. Guard the source by project, run, proposed status and expected review version; use an exclusive row lock on Postgres. Build the Action graph first, then accept the recommendation only if this invocation's complete graph exists, all in one batch. Keep ordinary accepted-only Action creation unchanged.
2. Reuse the existing Action validation and immutable-fact checks. The investigation endpoint no longer separately accepts a recommendation. Existing saved Actions replay without changing their date/actor/event. A legacy accepted-without-action record is a safe conflict; do not fabricate its missing approval facts or reapprove it silently.
3. Update the existing recovery state to explain the legacy conflict without an approval form. No page redesign or new controls.
4. Exercise rollback, races, retries, legacy state, target/scope and Work projection on both providers. Use a dedicated loopback-only Postgres container from the cached image; no real database or provider calls. Run CI/build once after targeted checks, perform a fresh focused review, then commit the completed original slice plus this follow-up.

# Constraints

No migrations/dependencies, additional services/databases/auth/MCP for the product, paid calls, real-project mutations or publication. The temporary test database is verification infrastructure only. No destructive cleanup of existing containers, checkouts or preview data. Preserve all existing uncommitted work from the previous run.

# Explicit non-goals

New Growth features, assignment, delivery statuses, measurement, cross-check deduplication, automatic legacy repair, new visual system or global transaction abstraction.

# Risks

Accepting before graph creation can leave a split state; accepting on any existing graph can attribute another operation's facts incorrectly. Postgres shared-lock upgrades can deadlock. Gate acceptance on this invocation's unique Action and complete graph, use the right source lock, and prove rollback/concurrency on the actual provider. A legacy orphan's original actor/date cannot be recovered from existing fields; fail closed and explain that limit.

# Verification plan

Director-run SQLite/real-D1 and disposable Postgres approval tests, existing Growth regressions including the Work query, CI, build and whitespace. Fresh repair-focused engineering review covers both accepted findings and adjacent regression risk; retain prior rendered UI approval for unchanged layout and add rendered-component evidence for the small recovery-state patch.

The attempted browser check was denied by the browser URL security policy. Do not bypass it. For this native-text-only recovery-state patch, use the static-render contract tests and actual service/database checks, disclose the missing fresh visual check, and ask the fresh reviewer to assess that evidence substitution. This does not permit claiming new screenshots or browser interaction success.
