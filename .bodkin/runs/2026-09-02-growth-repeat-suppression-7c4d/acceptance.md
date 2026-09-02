# Required behaviour

1. Every repeated priority-page decline remains a new immutable Signal, while
   one project/key-page/metric issue has one unreleased controlling
   Recommendation across Runs.
2. The normalized project-qualified ledger records each Signal as controller or
   suppressed, requires a closed non-null decision-time reason for suppression
   and preserves exact replay while the Signal is retained.
3. Graph creation, legacy adoption, controller claim and fallback suppression
   occur in one provider-aware atomic write. Deterministic parent IDs and the
   PostgreSQL source-Run lock prevent duplicate or orphan graphs during both
   candidate and terminalization races.
4. Existing deterministic pre-ledger investigations are adopted only through a
   supported terminal manual Run, exact detector/template source, one direct
   Signal/Insight/Recommendation graph, one URL target and the exact three
   stored template steps. Exact template Actions alone influence ordering and
   Work projection.
5. A later equivalent Signal receives a strict read-only projection with the
   controller title/status, immutable saved reason, policy version and optional
   exact Work link. It never receives the controller's earlier rationale,
   steps or target evidence and cannot review or approve through its identity.
6. A later generation failure after one durable decision terminalizes the
   source as `completed_with_errors` with the supported analysis version so
   committed controllers remain readable. Failure before any decision leaves
   no active controller and fails the Run.
7. Deleting a suppressed Signal removes only its link. A controller
   Recommendation or Run cannot be removed while retained Signal decisions
   depend on it, while whole-project deletion still cascades without dangling
   rows.
8. Policy v1 is conservative and never releases a controller. No fuzzy URL
   matching, AI, new provider call, dependency, schedule, alert, Measurement,
   report, MCP, auth system, database or separate Growth service is introduced.

# Required checks

- Both generated migration trees and schema parity pass, including explicit
  suppressed-null-reason rejection.
- Real SQLite service integration proves distinct-Run suppression and durable
  partial-generation recovery; repository tests prove retry, legacy and graph
  integrity.
- A freshly migrated disposable PostgreSQL 16 database proves the controller
  race, terminal-Run lock, null constraint, legacy adoption and deletion
  lifecycle.
- `pnpm ci:check`, the full true one-worker suite, production build and final
  staged plus unstaged whitespace checks pass under the 4 GB Node heap cap.
- Fresh adversarial review passes after the bounded repair, followed by
  evidence-based acceptance.

# UI evidence boundary

This is a local non-material patch over the existing investigation disclosure.
Strict runtime projection, semantic copy and dispatch absence are verified by
tests. Browser, screenshot, responsive-layout and visual-quality evidence were
prohibited in this session, so acceptance makes none of those claims.
