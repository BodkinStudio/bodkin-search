# Codex Start Prompt

Use this after creating the Bodkin fork of OpenSEO and copying the Growth planning pack into the repository, for example under `docs/growth/`.

---

You are working in a Bodkin-maintained fork of `every-app/open-seo`.

Your job is to help implement **Bodkin Growth**, an agency SEO operating layer that extends OpenSEO.

Read these files before doing anything:

1. the repository root `AGENTS.md`
2. `docs/growth/README.md`
3. `docs/growth/00_REVIEW_AND_DECISIONS.md`
4. `docs/growth/01_VISION.md`
5. `docs/growth/02_PRODUCT_REQUIREMENTS.md`
6. `docs/growth/03_TECHNICAL_ARCHITECTURE.md`
7. `docs/growth/04_IMPLEMENTATION_PLAN.md`
8. `docs/growth/05_ARCHITECTURE_DECISIONS.md`
9. `docs/growth/AGENTS_BODKIN_APPENDIX.md`

Do **not** start implementing Growth yet.

First perform **Phase 0 discovery**.

Create `docs/growth/UPSTREAM_MAP.md`.

Inspect the current repository and document the actual current implementation of:

- organisation and project tenancy;
- auth modes;
- API keys;
- MCP authentication and project authorisation;
- MCP tool registration conventions;
- database provider abstraction;
- SQLite/D1 and Postgres schema/migration workflow;
- DataForSEO client/service boundaries;
- GSC connection, performance and URL-inspection services;
- rank tracking schedules and historical snapshots;
- backlinks and historical snapshots;
- site audit scheduling/data;
- AI visibility and prompt-explorer services;
- any current GA4 support;
- existing scheduled/cron/workflow infrastructure;
- existing report/export/share functionality;
- current agent/skill infrastructure.

Then compare the current upstream code with the Growth planning pack.

Add a section:

## Growth gap analysis

With four tables:

1. **Already exists upstream**
2. **Can be composed from existing services**
3. **Growth-specific work required**
4. **Plan assumptions that are now stale or wrong**

For each item include relevant source file paths.

Also inspect recent repository issues/PRs if local Git metadata or GitHub CLI access makes that possible, especially for:

- GA4;
- AI visibility MCP;
- client reports;
- alerts/notifications;
- scheduling;
- MCP auth.

Do not add new dependencies.

Do not change application code.

Run the standard repository checks needed to confirm the fork is healthy and record results in `UPSTREAM_MAP.md`.

Finish by proposing the **smallest Phase 1 implementation sequence** based on the code that actually exists today.

The guiding rule is:

> Reuse OpenSEO. Build only the missing Growth operating layer.

Do not create a separate Growth service, database, auth system or MCP server unless you discover a concrete blocker and document it for review first.
