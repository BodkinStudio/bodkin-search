# Required behaviour

- `docs/growth/UPSTREAM_MAP.md` accurately documents all architecture areas named in the Phase 0 request, with relevant current source paths.
- The `Growth gap analysis` section contains four clearly labelled tables: already exists upstream; can be composed from existing services; Growth-specific work required; stale or wrong plan assumptions.
- Relevant local or GitHub issue/PR evidence is included for GA4, AI visibility MCP, client reports, alerts/notifications, scheduling, and MCP auth when accessible.
- The document records the fork/upstream identity, health-check commands and outcomes, blockers if any, and a smallest coherent Phase 1 sequence grounded in current code.

# Required checks

- Inspect all requested planning-pack files and the repository root guidance.
- Run repository-configured lint/type/test/build/schema checks proportionate to Phase 0 and record their exact status.
- Inspect the final Git diff to prove no application code or dependency changes.
- Complete a fresh read-only adversarial review and resolve or explicitly disposition material findings.

# Regression constraints

- No dependencies are added or updated.
- No application, schema, migration, configuration, auth, MCP, or workflow code is changed.
- Existing user changes, if any, are preserved.

# Important edge cases

- Differentiate built-in auth from Better Auth organisation mode.
- Differentiate route/MCP project selection from actual organisation-authorisation enforcement.
- Differentiate scheduled orchestration from persisted historical snapshots.
- Differentiate implemented GA4/report/alert capabilities from proposals or open upstream work.
- Date remote-roadmap evidence and avoid presenting issue intent as shipped functionality.

# Product / UX requirements

None.

# Specialist review requirements

None.
