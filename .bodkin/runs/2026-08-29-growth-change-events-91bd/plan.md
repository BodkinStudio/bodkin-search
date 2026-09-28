# Goal

Implement BG-0108 as the next mergeable Bodkin Growth primitive: record immutable, project-scoped manual website Change Events with canonical affected URLs, and attach them to zero or more existing Actions through separate append-only links.

# Scope

- Record the Change Event, URL, Action-link, retry and deletion decisions in ADR-025.
- Add Change Event, Change Event URL and Action–Change link tables to the existing D1/SQLite and Postgres Growth schemas and migration paths.
- Add Zod contracts, project-scoped repositories and trusted internal services for manual event creation/read and idempotent Action linking.
- Reuse current Growth URL normalization, immutable-fact hashing, provider-aware batch boundary, tenancy keys and dual-provider test infrastructure.

# Director decisions

- A Change Event is an independent website fact owned by a project. Its immutable core is source, change type, recording actor, description, occurrence time, optional external reference and one or more canonical exact URLs.
- The BG-0108 service records `manual` source. The persisted source registry is `manual | sherpa | cms_webhook | deployment`; later authenticated adapters may stamp the other values without accepting caller-claimed provenance.
- Change types are `content_updated | title_meta_updated | page_created | page_removed | redirect_changed | internal_links_changed | template_changed | structured_data_changed | technical_fix | design_restructure | migration | unknown | mixed`. `unknown` and `mixed` are distinct; vendor-specific deployment sources are not persisted.
- Each caller-stable creation key is unique within a project. A complete fact hash covers normalized immutable core data and the sorted, deduplicated URL set, excluding generated ID/created time. Exact retries return the stored graph; drift conflicts and cannot attach losing URLs.
- URLs are exact page coordinates, not site wildcards. They reuse the current Growth exact-URL canonicalizer, must belong to the current unarchived project domain or its subdomains, and are stored as normalized relations. Global/site-wide confounder scope is deferred.
- Event facts and URL children are immutable and expose no ordinary update/delete API. Corrections require a later void/supersession design rather than historical rewriting.
- Action links are independent append-only many-to-many associations and are not part of the Change Event fact hash. A standalone Event may be linked later. Linking an exact project/Event/Action coordinate is idempotent; there is no unlink API in this slice.
- Links may cross originating Growth runs but never projects. They do not require URL overlap or a particular Action status, and do not transition the Action, change milestones, append an Action lifecycle event or start measurement.
- Project deletion cascades through Events, URLs and links. Change Event deletion would cascade only its children. Action/Recommendation/run deletion removes affected join rows but preserves the independent Change Event and URLs.
- Measurement anchor/primary-change semantics remain a BG-0109 decision. BG-0108 does not designate one linked Event as causal or primary.

# Relevant areas/files

- Current Action aggregate and project-leading keys: `src/db/growth-actions.schema.ts`, `src/db/pg/growth-actions.schema.ts`.
- Immutable graph writes and provider transaction pattern: `src/server/features/growth/repositories/GrowthActionsWriter.ts`, `src/db/runBatch.ts`, `src/db/provider.ts`.
- Current canonicalization: `src/server/features/growth/services/GrowthTargetNormalizer.ts`, `src/shared/researchScope.ts`.
- Project-scoped reads/errors/hashes: `GrowthActionsRepository.ts`, `GrowthActionsService.ts`, `src/server/lib/audit/ids.ts`, `src/server/lib/errors.ts`.
- Planned truth: `docs/growth/02_PRODUCT_REQUIREMENTS.md` section 11, `03_TECHNICAL_ARCHITECTURE.md` sections 6.12–6.14 and 22, and `04_IMPLEMENTATION_PLAN.md` BG-0108.

# Implementation approach

- Add mirrored `growth-change-events.schema.ts` modules with explicit source/type/actor checks, bounded fields, project-leading composite keys, a recent-event index, a URL lookup index and normalized cascading child/link relations.
- Add a shared exact-URL wrapper over the existing Growth target normalizer and reuse the Action actor registry so service contracts cannot drift.
- Record the parent and URL set in one fact-hash-gated `runBatch`; select and lock the expected active project on Postgres, and insert children only through the stored winning parent fact.
- Link one Event/Action coordinate per trusted call through a project-scoped insert-select plus unique-key retry semantics, then reread the coordinate. This keeps each association atomic without unbounded D1 parameters or partial multi-link requests.
- Reread and compare the complete immutable event core and URL set after creation. Return current Action links as associations without treating them as part of exact-core retry validation.

# Constraints

- Reuse existing project tenancy, database provider abstraction, typed errors, hashes and Growth feature boundary.
- Keep every read/write explicitly project-scoped and every relationship normalized.
- Add no dependency, paid/provider call, production migration, network URL check, server function, UI, MCP tool, scheduler or new service/database/auth layer.

# Explicit non-goals

- Site-wide target semantics; Change Event correction/void/supersession; unlinking; link audit metadata; implementation notes; deployment/CMS adapters; Action transition orchestration; Measurement Plans/Results; confounder scoring; semantic deduplication; public surfaces; reports.
- Requiring a Change Event URL to match an Action target, treating the project-root URL as a wildcard, or deleting an independent Change Event when a linked Action disappears.

# Risks

- Concurrent same-key drift can contaminate URL children; every child insert must select only the winning parent with the complete fact hash.
- Project deletion/domain change can race URL validation; condition and provider-lock creation on the same active project/domain used for normalization.
- A same-project check performed only in service code can leak or cross-link tenants; retain composite database FKs and project-scoped lookup wording.
- Hashing Action links would make a valid Event appear corrupt after Action/run cascades; keep association identity separate from immutable Event identity.
- A multi-link write could exceed D1 limits or commit partially; expose one idempotent link coordinate per operation.

# Verification plan

- Focused Zod, service and lifecycle tests for vocabularies/bounds, exact timestamp and URL canonicalization, standalone events, retry/drift, project isolation and append-only many-to-many links.
- A real-libSQL migration test beginning after migration 0046 with populated Actions, raw constraint/cross-project/cascade assertions and a clean `PRAGMA foreign_key_check`.
- A real-libSQL repository test through production Drizzle/runBatch for complete event graphs, concurrent-style exact/drift retries, link idempotency and deletion direction.
- Generate/inspect both migrations, apply the full Postgres tree to a fresh disposable database and run provider-gated repository concurrency/cascade tests.
- Run schema parity, all focused Growth tests, root tests, `ci:check`, production build and `git diff --check`.
- Obtain a fresh full-scope adversarial acceptance review, repair accepted findings within the two-round cap and reconcile final evidence before commit.
