# Goal

Produce a verified Phase 0 map of the current OpenSEO fork so Bodkin Growth Phase 1 is based on repository facts rather than planning-pack assumptions.

# Scope

- Copy the supplied Growth planning pack into `docs/growth/`.
- Inspect the current implementation across tenancy, auth, MCP, databases, SEO data/services, schedules, reporting, and agent infrastructure.
- Inspect relevant local/upstream GitHub history where available.
- Record the architecture map, four-part Growth gap analysis, repository health checks, and the smallest Phase 1 sequence in `docs/growth/UPSTREAM_MAP.md`.

# Relevant areas/files

- `AGENTS.md`, `README.md`, `package.json`, `.github/workflows/`
- `src/db/`, `drizzle/`, `drizzle-pg/`
- `src/server/`, `src/serverFunctions/`, `src/routes/`
- `.agents/`, `.claude/`, `plugins/`, `.claude-plugin/`, `.cursor-plugin/`
- `docs/growth/`

# Implementation approach

Map independent architectural areas in parallel, reconcile every claim against source paths, then write one evidence-led document. Run the repository's configured health checks and obtain a fresh read-only review before acceptance.

# Constraints

- Do not add dependencies.
- Do not change application code.
- Preserve the existing OpenSEO tenancy, auth, database, provider, scheduler, and MCP boundaries.
- Treat the supplied planning documents as context to verify, not as facts about current code.

# Explicit non-goals

- No Growth schema, services, UI, MCP tools, or infrastructure implementation.
- No fork rebranding or broad refactor.
- No remote mutations, issue edits, or pull-request changes.

# Risks

- Fast-moving upstream work may make local-only conclusions stale; control with Git metadata/GitHub evidence and dated findings.
- Similar features may be spread across route, service, repository, workflow, and schema layers; control with cross-area searches and source-path citations.
- Full checks may require unavailable credentials or services; record exact command outcomes and distinguish environment blockers from product failures.

# Verification plan

- Confirm the deliverable contains every requested map area and all four gap tables with source paths.
- Confirm no application code or dependency manifest changed.
- Run the standard configured repository checks that are safe in the local environment and record exact results.
- Fresh adversarial review challenges factual accuracy, coverage, and Phase 1 sequencing.
