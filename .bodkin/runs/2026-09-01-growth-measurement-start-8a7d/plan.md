# Goal

Let a user start measurement for Done investigation Work from one explicitly selected linked website Change Event. Freeze that event's recorded date as the plan anchor instead of using the investigation Done timestamp.

# Scope

Deliver one Work-facing vertical slice: revise the accepted measurement anchor decision; add an additive normalized plan-anchor relation for D1 and Postgres; adapt the existing atomic measurement start; derive a proposal from saved project defaults and Action URL targets; expose project-authorized read/start server functions; and add a lazy, explicit Start measurement panel to Work.

# Relevant areas/files

- `docs/growth/02_PRODUCT_REQUIREMENTS.md`, `03_TECHNICAL_ARCHITECTURE.md`, `04_IMPLEMENTATION_PLAN.md`, `05_ARCHITECTURE_DECISIONS.md`
- `src/types/schemas/growth-measurements.ts`, `growth-work.ts`
- `src/db/growth-measurements.schema.ts` and `src/db/pg/growth-measurements.schema.ts`
- `GrowthMeasurementsService`, repository, writer, facts and graph validation
- Existing exact Work qualification, Action targets, linked manual Change Events, Growth settings and Work disclosures

# Implementation approach

Add `growth_measurement_plan_anchors` as a one-to-one project-scoped relation between a Plan and the exact Action-linked Change Event. New Plan facts include that event ID; old plans keep their old fact shape and remain readable/finalizable without invented anchors. The atomic writer verifies project, Action, link, manual source, immutable timestamp and version before writing Plan, anchor, metrics and the `implemented → measuring` event.

Add a `GrowthWorkMeasurementService` facade. It qualifies the exact investigation, reads its canonical URL targets, linked manual changes, project settings and any existing plan. It resolves the recorded UTC Change date into the saved defaults: baseline `A-N` through `A-1`; cooldown through `A+C`; primary window `A+C+1` for `P` days; optional long window for `L` more days. It proposes URL-level GSC clicks as primary and impressions as secondary, with at most 25 URL targets so the existing 50-metric limit holds. The browser supplies only project, Action, expected version and selected Change Event; project and actor come from middleware.

Add a third lazy Work disclosure using native controls and existing history presentation. Done Work requires a blank-by-default explicit selection, shows the recorded change and frozen proposed schedule, then confirms Start measurement. Active/completed plans render read-only. Uncertain responses keep the exact request locked for retry or authoritative refresh.

# Constraints

- Reuse OpenSEO's database, authorization, services and server.
- Keep SQLite/D1 and Postgres schemas and behavior equivalent.
- Manual Change date is an explicit UTC calendar date; do not shift it to a prior day in western report timezones.
- Preserve exact retry, concurrency and immutable-fact behavior.
- Preserve ADR-025's append-only links and lack of automatic URL-overlap restriction.
- No dependencies, raw provider payloads, secrets or caller-controlled actor identity.

# Explicit non-goals

No GSC/GA4/provider collection, observations, delta calculation, automatic scheduling, confounder classification, result finalization UI, AI interpretation, MCP/report changes, plan editing/cancellation/revision, Change Event editing/unlinking or Gate 3 claim.

# Risks

- A merely same-project but unlinked event could poison a Plan: service and atomic SQL both verify the exact Action link.
- A lost response could create a second or drifted plan: Plan-per-Action uniqueness and fact comparison freeze the selected event and proposal.
- A new Plan could masquerade as legacy if its relation is missing: new fact shape identifies it and graph validation rejects it.
- Migration could damage existing measurement descendants: use an additive table and preservation/rollback tests rather than rebuilding Plans.
- Window arithmetic can drift by one day or timezone: test product examples, zero cooldown, month/year boundaries and UTC-date behavior.
- Material UI evidence remains subject to the existing browser-policy limitation; do not substitute old captures or source tests for rendered review.

# Verification plan

Run focused schema/service/server-function/UI tests; actual SQLite writer/query/migration and rollback checks; actual disposable Postgres migration and concurrency cases; schema parity; type-aware lint; source detector; full `pnpm ci:check`; one production build. Refresh the existing safe local preview without resetting data. Obtain fresh desktop/narrow screenshots and independent UI review if policy permits; otherwise escalate that acceptance gate explicitly. Run one fresh full engineering review and, because this is DEEP, a bounded final acceptance audit.
