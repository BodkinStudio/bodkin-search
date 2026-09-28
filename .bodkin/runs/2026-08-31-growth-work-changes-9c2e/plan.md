# Goal

Continue the roadmap with BG-0302/0303: connect an investigation Work item to an already recorded page change, preserving the evidence chain.

# Scope and approach

Add a lazy Related page changes disclosure to each Work item. Show saved linked manual changes separately from up to 50 recent same-project manual candidate changes, with one explicit Link saved change action and an ordinary anchor to the existing change log. Both bounded lists explicitly cover manual entries; other ingestion sources are outside this slice. Reuse its history presentation, native labelled form controls, TanStack Query and server-function patterns. The user chooses a record; do not choose or link one automatically.

Reuse GrowthChangeEventsService.linkAction and growthActionChanges unchanged. Add only scoped reads, a qualified Work application wrapper, strict contracts and UI. Share the existing getQualifiedWork rule rather than weakening exact-ID investigation qualification. Derive project identity through requireProjectContext. ADR-025 deliberately permits links at any Action status and without URL overlap: do not change that primitive or silently impose matching rules.

# Relevant evidence

GrowthWorkDelivery has the lazy-disclosure/retry precedent. GrowthChangeLog/History provide saved manual change presentation. GrowthChangeEventsRepository already bulk-loads URL children. GrowthInvestigationsService.getQualifiedWork checks the exact supported Action. ADR-025 governs append-only independent associations; ADR-026 anchors measurement to implementedAt and needs a separate decision before investigation completion becomes an SEO measurement origin.

# Contract

getGrowthWorkChanges({projectId, actionId}) returns GrowthWorkChangesOverview {actionId, linkedChanges, availableChanges, limit:50}. Both change arrays use the existing safe change DTO fields id/changeType/description/happenedAt/recordedAt/displayUrls. Read linked manual changes by Action independently of recent candidate history, with bulk URL loading. linkGrowthWorkChange(LinkGrowthWorkChangeInput {projectId, actionId, changeEventId}) validates supported Work and a same-project manual change and returns the confirmed pair. Export these contracts from types/schemas/growth-work.ts and functions from serverFunctions/growthWork.ts. Reject unknown input fields. Same pair retries are idempotent. Do not expose actor IDs, hashes, external refs or raw URLs.

# Ownership

Director: Work UI, new related-change form/panel tests, preview, docs and independent verification. Bounded implementer: Work contracts/server functions/services, change repository read/query tests, existing shared DTO/qualification exports if needed. No overlapping edits. No new dependencies, migrations, provider calls or broad refactors.

# Risks and non-goals

Keep uncertain requests frozen to the exact pair and prevent double dispatch; query cache keys include project and Action. No unlink, event editing, new timestamps, status transition, measurement start, scheduling, AI or external rollout. No date-based causal claim. Live bodkin.studio usefulness and GSC collection remain unverified. Missing ui-skills CLI is not installed; local narrow skill guidance is used. This is an extension of the incumbent interface, not a new visual identity or design interview.

# Verification

Focused service/schema/server-boundary tests, actual SQLite scoped query tests and opt-in Postgres query case if a new SQL read is added. Root executes these independently, then full repository CI and one production bundle after changes settle. One fresh focused engineering review, at most two automatic repairs. UI source detector/preflight and fresh permitted desktop/narrow visual review remain required; the existing browser access denial prohibits alternate browser or HTTP workarounds. A truthful preview/code checkpoint is allowed with that unresolved gate explicit.
