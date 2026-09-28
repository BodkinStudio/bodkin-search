# Goal

Let the user explicitly mark an approved investigation's work done without saving artificial Ready/In progress steps. Keep finishing work distinct from evaluating SEO impact.

# Scope

Add approved/ready to implemented as direct Action transitions. In Work only, label implemented as Done and default an eligible form to Done with a Mark done submit button. Preserve the other legal status choices, notes, history and existing uncertain-request recovery.

This is a new product change prompted by the user's Done feedback, based on commit 2752d36. The prior Work-status run remains escalated for missing visual evidence; its repair budget and history are not reset. This run also requires permitted fresh UI evidence before full acceptance.

# Relevant areas/files

The shared graph is in src/types/schemas/growth-actions.ts. Both src/db/growth-actions.schema.ts and src/db/pg/growth-actions.schema.ts enforce the graph and milestones. GrowthActionsWriter already preserves a null startedAt unless in_progress was recorded. Work's authorized wrapper and atomic CAS/event service remain unchanged. GrowthWorkStatusForm, GrowthWorkPresentation and GrowthWorkDelivery own the existing UI.

# Implementation approach

1. Extend both provider constraints through new forward migrations, without editing old migrations. An unrecorded start remains null in implemented/measuring/evaluated; in_progress/blocked still require a recorded start. The existing writer stamps implementedAt and emits one real transition with one version increment.
2. Delegate only backend/schema/migration work. Director owns the local UI change and its tests. Reuse the existing service, request identity, validation and history rather than adding endpoints or completion abstractions.
3. Independently prove populated SQLite/D1 migration safety and Postgres execution, direct completion/retry and measurement compatibility. Review the migration/data implications separately from visual quality.
4. Refresh only the existing disposable preview with its credential-free growthPreviewEnvironment helper. No real or remote database is migrated.

# Constraints

No dependencies, new status values, auth changes, provider calls, automatic website edits, fabricated intermediate events or fabricated start timestamps. Preserve exact-ID investigation qualification and actor-bound CAS/replay. Done stays visible; it is not a terminal evaluated outcome. SQLite migration must retain all Action descendants and links with foreign keys enabled, including change events, measurements and reports. Do not trust a generated DROP/rebuild to preserve CASCADE dependents.

# Explicit non-goals

Dashboard redesign, ownership, reopening done/cancelled work, measurement UI, scheduled checks, live provider testing and deployment. Do not amend control-plane files. The missing ui-skills CLI is not installed; use the installed narrow UI guidance. Existing Impeccable context was already loaded for this product; preserve its incumbent patterns.

# Risks

Promoted from STANDARD to DEEP because the requested shortcut changes stored lifecycle checks. Preserve unknown start times instead of inventing milestones. Data-loss risk from SQLite parent-table rebuilds requires populated graph-preservation evidence, including a real local D1 migration. If that evidence cannot be established, do not migrate the existing preview or claim readiness.

# Verification plan

Focused Growth Action/Work/Measurement tests, forward-migration preservation and invalid-edge tests, actual Postgres cases on a task-only migrated database, actual local D1 upgrade with populated synthetic data, repository ci:check and production bundle after the final implementation (rerun failed gates only). Fresh full engineering review of this feature and its migration boundary; at most two repairs. Bodkin UI preflight and independent rendered review remain required. The existing browser URL-policy denial prohibits alternate browser or indirect workarounds; static tests cannot replace visual acceptance.
