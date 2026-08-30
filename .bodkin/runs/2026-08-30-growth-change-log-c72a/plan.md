# Goal

Continue the user's approved small, demonstrable Growth milestones after committing priority-page checks. Let a person record a change to a configured priority page and reopen the saved history beside the checks.

# Scope

One-page manual change form: priority page, change type, date changed (UTC), description. Project-scoped, bounded saved-change history. Reuse immutable Growth Change Events and normalized URL relationships.

# Relevant areas/files

- src/server/features/growth/services/GrowthChangeEventsService.ts and repositories/GrowthChangeEventsRepository.ts
- src/server/features/growth/services/GrowthEvidencePacket.ts: existing safe URL display
- src/serverFunctions/growthChecks.ts: authenticated server-function precedent
- src/types/schemas/growth-change-events.ts: existing change types
- src/client/features/growth/GrowthPreviewPage.tsx and GrowthPriorityPageChecks.tsx
- src/client/features/projects/project-context/KeyPagesSection.tsx: incumbent form styling

# Implementation approach

1. Add strict create/overview contracts and a thin change-log service. Resolve the selected key-page ID within the authorized project. Derive the actor from authentication. Persist through the existing immutable event writer; list the latest 50 manual events using deterministic ordering and bounded target reads.
2. Add an inline form and saved history to Growth, below the check region and above the synthetic demonstration. A UTC date-only input is persisted as UTC midnight and displayed as a UTC date, not an asserted exact change time.
3. Preserve one frozen request/payload for uncertain in-place retries. Scope the service's creation identity to project, key page and UUID; replay stored targets before revalidating current page setup. Do not store notes in browser storage. Reload reads saved history; it never automatically resubmits a form.
4. Test narrow trust boundaries, persistence/retries and render states. Independently run checks, then demonstrate real create/reload against the disposable no-credential preview. Obtain fresh engineering and rendered UI reviews.

# Constraints

No dependencies, schema/migration changes, external API calls, separate services, credentials, real-project mutations, or review-control-plane edits. SQLite and Postgres compatible queries. Files stay below the repository's 400-line limit. Keep OpenSEO visual conventions; do not rebrand the shell.

# Explicit non-goals

No editing/deleting events, bulk targets, automated collection, recommendations, Actions, outcome measurement, causality claims, provider calls, or attaching selected changes to evidence packets. History beside evidence is not evidence of causation. No automatic mutation retry after navigation/reload; uncertain submissions must be checked against saved history.

# Risks

- Forged project, actor or target: authenticated context and project-scoped key-page resolution; strict schemas reject extra authority fields.
- Duplicate uncertain submissions: immutable page-scoped request key, frozen payload during retry; disable double submission. Explain checking history if leaving an uncertain save.
- Sensitive URLs: use the existing URL-display boundary for both configured and historical targets, never make raw query strings clickable.
- Date ambiguity: explicit UTC day semantics and reject future/invalid days.
- Unbounded history: 50 most recent manual events, disclose the limit. Read-only list without provider calls.

# Verification plan

Backend unit/schema/server-function tests plus real SQLite integration with the existing test harness. Narrow client render/interaction tests and current preview regressions. Targeted lint first; full ci:check and production build once the slice is coherent. Browser create, reload and desktop/narrow screenshots against synthetic data. Independent engineering and Bodkin UI review; at most two engineering repair rounds and one UI correction round.
