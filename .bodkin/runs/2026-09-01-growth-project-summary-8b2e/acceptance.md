# Required behaviour

1. `growth_get_project_summary` is registered on the existing MCP server and
   mirrored from the same definition into SAM; no second server is created.
2. Canonical MCP project authorization completes before the summary service;
   the service receives only the already-authorized allowlisted project fields.
3. Output is a strict, bounded, privacy-safe DTO with one canonical `asOf` and
   an explicit current-view/non-atomic-snapshot consistency statement.
4. Project identity, four typed context sections, Recommendations and Actions
   use existing credential/email/URL safety projection plus truthful smaller
   post-projection truncation flags. Raw project domain is never echoed.
5. Context reports typed-section presence and other context counts without
   claiming prose quality, full context completeness or historical activity.
6. Unresolved Recommendations include proposed, snoozed and accepted-without-
   Action rows only. They expose status and snooze/action-needed state and are
   bounded to five plus `hasMore` in stable priority/current-order.
7. Current Actions include only six nonterminal operational states, are bounded
   to five plus `hasMore`, and do not reuse detector-qualified Work.
8. Recent Signals come only from completed/completed-with-errors Runs, omit raw
   entity/evidence references, and apply `capturedAt <= asOf` in the repository
   before limiting. They are bounded to five plus `hasMore` in explicit
   critical, warning, info severity order followed by capture recency.
9. Freshness is explicitly limited to saved Growth Signal capture time overall
   and by evidence kind; its repository aggregates also apply
   `capturedAt <= asOf`. Latest Run is a separate safe status projection.
10. Active Measurement dates use each Plan's frozen timezone and become due on
    the first local date after the final inclusive window. Completed Plans are
    excluded. Integrity is one of `action_missing`, `action_state_mismatch`,
    `action_version_mismatch` or `consistent`, in that precedence. Consistency
    requires status `measuring` and Action state version equal to Plan action
    version; no state claims evidence completeness or finalization readiness.
11. Fifty or fewer active Plans are evaluated completely; 51 candidates produce
    an overflow state with no partial items. A complete scan displays at most
    five due Plans with truthful `hasMore`.
12. All deterministic query ties use SQLite BINARY/Postgres C code-unit ID
    ordering, project-leading predicates and narrow allowlisted selections.
13. The tool is read-only, closed-world, non-destructive, saved-data-only,
    zero-credit and provider-free and returns standard project metadata plus the
    Growth page deep link.
14. SAM removes model-visible `projectId`, injects its bound project server-side
    and preserves the shared tool definition.
15. No dependency, schema, migration, provider, billing, auth, scope, transport,
    public route, server function, UI or print change is added.

# Required checks

- Strict DTO and privacy/boundary service tests pass.
- SQLite/D1 and required disposable Postgres 16 query tests pass.
- MCP auth/output/text, real in-process protocol and SAM binding tests pass.
- Existing Action and monthly-summary MCP/SAM regressions pass.
- Focused tests, `pnpm ci:check`, full tests, production build and whitespace
  checks pass.
- `verification.json` records independently executed commands/results before
  implementation review.
- Fresh adversarial review has no outstanding findings.
- External HTTP/headless probes are explicitly waived and not claimed.

# Regression constraints

- Existing Action list, qualified Work, context and monthly-summary behaviour
  does not change.
- No provider call or credit use is reachable from the summary service/tool.
- No list without a complete bounded scan claims totality.
- No mutable current-row composition is presented as a historical snapshot.
