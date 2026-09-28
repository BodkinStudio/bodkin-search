# Acceptance: evaluated investigation controller release

## Outcome

Pass.

This slice completes the bounded BG-0207B lifecycle rule for priority-page click-decline investigations. A later captured decline may begin a new deterministic investigation cycle only after the exact generated Work Action for the current controller has reached `evaluated` with a valid earlier event instant.

## Accepted behavior

- Existing v1 decision rows remain unchanged; newly written decisions use `priority-page-repeat-suppression-v2`.
- Proposed, snoozed, dismissed, resolved, and accepted-but-unfinished work continues to suppress repeated Signals.
- Release happens lazily while deciding a later Signal, not as a side effect of Action finalization or reads.
- The exact project-scoped controller Recommendation and Signal-derived template Action must qualify the release.
- The candidate Signal must belong to a still-running Run and be strictly later than the Action evaluation instant.
- PostgreSQL locks that running Signal/Run source before any controller release, so terminalization either wins first or waits for a complete successor decision.
- D1/SQLite and PostgreSQL compare timestamp instants with equivalent fail-closed behavior for equal or malformed historical values.
- The previous controller Recommendation identifies the next deterministic cycle; exact retries remain stable.
- Concurrent candidates create one active successor, record the loser as suppressed, and leave no orphan graph rows.
- An active normalized ledger controller wins over any legacy fallback.

## Scope confirmation

No schema, migration, dependency, UI, MCP, authentication, provider-service, scheduler, alert, or database-abstraction changes were made. This remains inside the existing Growth service and normalized opportunity-decision repository.

## Evidence

- Accepted plan after two adversarial revisions for timestamp and PostgreSQL cast safety.
- Two bounded repair rounds closed same-millisecond release-marker reuse and a terminal-Run interleaving found by the final acceptance audit.
- Fresh PostgreSQL 16 migrations and eleven live provider tests passed in a disposable resource-limited container that was removed afterward.
- Focused policy/D1 tests, TypeScript, type-aware lint, repository CI, full one-worker test suite, production build, formatting, and diff checks passed.
- Full suite result: 2,230 passed and 40 provider-gated skipped tests.

See `verification.json` and `review.json` for command-level evidence and preserved invariants.

The final fresh acceptance audit returned pass with no findings.
