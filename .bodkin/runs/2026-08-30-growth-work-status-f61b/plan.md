# Goal

Continue Bodkin Growth with delivery-status controls for saved investigation work. Base: `432c186` on `main`, initially clean.

# Scope

Expose the existing direct Action transitions and a bounded recent event history within Work. STANDARD: established lifecycle and auth patterns, feature-local UI/API changes, no new schema or shared infrastructure.

# Relevant areas/files

- `GrowthActionsService.transitionAction` already provides versioned, atomic status/event writes and exact actor/note retries.
- `GrowthActionsRepository.listInvestigationWork` contains the canonical same-project source joins and template keys. Reuse these for an exact-ID lookup, without the latest-50 membership restriction.
- `growth-actions.ts` distinguishes direct delivery transitions from measurement-only transitions.
- Existing Growth Work, investigation approval and Change log provide the native disclosure, form, query and error patterns.

# Implementation approach

1. Add the saved version to Work, exact-ID scope and bounded recent-history reads. Preserve the existing complete ascending event reader.
2. Compose authorized status/history server functions with the existing service; derive the actor from project middleware. Delegate this bounded backend work while the Director implements the UI.
3. Add a native disclosure, explicit next-status selection, optional note, saved history and frozen-request retry. Show persisted current state, never an optimistic destination.

# Constraints

Keep both database providers, auth, immutable due dates and original event facts unchanged. No dependencies or provider calls. Only direct transitions; implemented is not evaluated. UI tooling must not bypass the existing URL-policy denial.

# Explicit non-goals

Assignment, board redesign, date editing, reopening terminal work, measurement controls, automatic website changes/Change Events, scheduling, reports and MCP.

# Risks

Stale or concurrent writes must conflict rather than overwrite. A retry must preserve version/status/note and use the actual authenticated actor. Source qualification must not drift between list and exact-ID reads. History must be bounded without changing approval replay's complete event graph.

# Verification plan

Focused schema, service, auth-boundary, repository and UI tests; execute new query coverage on SQLite and disposable Postgres. Run file-scoped formatting/lint before full repository CI and one build. Fresh focused engineering review. Material EXTEND UI additionally requires fresh rendered evidence and UI review: these remain blocked by the browser URL policy, so this run cannot claim full UI acceptance without that evidence. Continue safe implementation and deterministic checks, then hand off the visual-review limitation explicitly.
