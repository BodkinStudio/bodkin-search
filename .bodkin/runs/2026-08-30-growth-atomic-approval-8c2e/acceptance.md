# Required behaviour

- A proposed investigation approval atomically saves acceptance, Action, normalized targets and its original actor/date creation event. Any failure in that operation leaves the recommendation proposed and no partial graph.
- Concurrent approvals produce one complete winning graph. Different dates or actors never replace the winner; the same saved result can be read/replayed without changing its immutable history.
- No-op/stale source, occupied creation key, foreign project/target, invalid graph and concurrent review cannot accept a recommendation without this operation's graph.
- Existing accepted-only Action creation and its strict fact checks remain intact; proposed approval is an explicit internal entry point, not a client override.
- Existing accepted-without-action records are readonly conflicts. The UI does not invite a retry that could invent their missing actor/date. No automatic repair or mutation is performed on read/reload.
- Work remains project-scoped, bounded to 50, deduplicated across matching joins, provider-free and backed by saved targets/source checks.

# Required checks

Real SQLite/D1 rollback and complete-graph tests; actual disposable Postgres rollback, concurrent approval, replay and grouped Work-query execution; existing targeted Growth/auth/form regressions; pnpm ci:check; production build; git diff --check. Explicitly record commands and results. Rendered-component evidence of the changed legacy recovery state and unchanged saved-work display.

Browser-check deviation: the browser tool's URL security policy denied access to the existing local QA tab. No alternate route or browser was attempted. This non-material PATCH replaces the legacy retry form with a native status paragraph; rendered-component tests establish the explanation and absence of date/approval controls. The previous independent visual review remains evidence only for the unchanged layout. A fresh in-browser visual check is unavailable and must be disclosed; it is not represented as passed. Fresh engineering review must assess whether the static-render and runtime evidence are sufficient for this narrow patch.

# Regression constraints

Keep server-derived project/actor/content/targets/identity, terminal check immutability, same-project/run relationships, normalized graph, action event history, provider abstraction and existing accepted Action APIs. No schema or dependency changes. Preserve the previous independent UI review's do-not-change constraints.

# Important edge cases

Failure after parent or child insertion; same and differing concurrent approvals; stale review version; a key occupied by another recommendation; previously accepted orphan; an Action already saved but response lost; old proposal after a successful concurrent approval; removed key-page setup; foreign-project requests; duplicate qualifying Work joins.

# Product / UX requirements

Keep the Growth layout and native controls. A legacy orphan clearly says its original approval details are unavailable and it cannot be completed here. Normal proposals still require an explicit due date; saved work stays readable. No automatic retries or reload submissions.

# Specialist review requirements

This is a small corrective UI-state patch: keep prior approved layout and capture the changed rendered state. Fresh engineering review must assess the retry/legacy semantics. Escalate to fresh rendered UI review only if material layout or control design changes become necessary.
