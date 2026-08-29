# Goal

Implement the first mergeable Bodkin Growth foundation slice on top of OpenSEO: record the schema/deployment decision, persist project-scoped Growth settings, and enrich the existing key-page model with safe Growth metadata and owning-project domain enforcement.

# Scope

- Add an accepted Growth schema ADR grounded in `docs/growth/UPSTREAM_MAP.md`.
- Add a one-to-one `growth_project_settings` model with enabled state, report cadence/timezone, and scalar measurement defaults.
- Add a Growth settings repository, service, Zod trust boundary, and project-authorized TanStack server functions.
- Extend `project_key_pages` with commercial weight, protected state, and active-optimization state.
- Enforce same-project-domain key-page URLs through the shared Project Context service used by the app, SAM, and MCP.
- Generate and review D1/SQLite and Postgres migrations and add focused tests.

# Relevant areas/files

- `docs/growth/05_ARCHITECTURE_DECISIONS.md`, `docs/growth/UPSTREAM_MAP.md`
- `src/db/project-context.schema.ts`, `src/db/pg/project-context.schema.ts`, schema barrels and parity tests
- New Growth schema files under `src/db/` and `src/db/pg/`
- `src/types/schemas/projectContext.ts` and a new Growth settings schema
- `src/server/features/project-context/`
- New `src/server/features/growth/` repository/service boundary
- `src/serverFunctions/projectContext.ts` and a new Growth settings server-function module
- `drizzle/`, `drizzle-pg/`

# Implementation approach

Keep all existing project/context ownership intact. Store only operational Growth settings in a project-keyed table; keep qualitative context and competitors in Project Context. Extend the existing curated key-page row rather than creating `growth_priority_pages`. Use additive columns with stable defaults, preserve omitted fields during existing upserts, perform domain checks in the shared service boundary, and expose settings through the established TanStack server function → service → repository path.

# Constraints

- Preserve SQLite/D1 and Postgres structural/query compatibility.
- Add no dependencies and do not execute production migrations or external mutations.
- Keep project authorization in the existing middleware; repositories remain project-scoped.
- Use normalized scalar columns rather than a JSON settings blob.
- Preserve all Phase 0 files and unrelated working-tree changes.

# Explicit non-goals

- No Growth runs, Signals, Insights, Recommendations, Actions, Measurements, reports, schedulers, detectors, AI, or provider adapters.
- No Growth UI, portfolio/client experience, report sharing, or new MCP tools.
- No parallel Growth project, competitor, priority-page, auth, database, service, or MCP server.
- No rebranding, broad refactor, deployment, or upstream synchronization.

# Risks

- Existing UI/SAM/MCP key-page writes omit Growth fields and could erase them; control with optional inputs, field-aware upserts, and a real SQLite query test.
- A URL-domain check can mishandle `www` or subdomains; normalize once and test exact host, `www`, allowed subdomains, sibling domains, credentials, and missing project domains.
- Provider schemas or generated migrations can drift; generate both trees, run schema parity, and inspect both SQL diffs.
- Cadence/day and measurement defaults can become ambiguous; define their semantics and bounds in the ADR and shared Zod schema.

# Verification plan

- Run focused Growth settings, Project Context, repository-query, schema-parity, and migration-backed tests.
- Run migration generation and prove both generated trees are present and coherent.
- Run `pnpm test:ci`, `pnpm ci:check`, and `pnpm vite build` independently after implementation.
- Audit the final diff for dependency, auth, infrastructure, and out-of-scope changes.
- Obtain a fresh read-only adversarial review; repair and repeat verification if it finds a material defect.
