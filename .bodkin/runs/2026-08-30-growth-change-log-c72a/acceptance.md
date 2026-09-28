# Required behaviour

- A member can record a manual change for one of the authorized project's configured key pages, with type, UTC date and nonblank description, without a GSC connection.
- The authenticated user is the event actor; arbitrary actor, project or URL overrides are not accepted.
- Saved immutable history survives reload, remains project-scoped and uses deterministic order with a disclosed 50-event bound.
- Identical in-place retries of a frozen request return the same saved event, including after removal of the configured page. Changed immutable facts under the same page-scoped identity conflict.
- Reading history never calls external providers or creates events. No automatic resubmission on reload.

# Required checks

- Focused validation/auth/service/client tests and real SQLite persistence/retry/scope integration.
- Targeted oxlint, pnpm ci:check, pnpm build and git diff --check pass, or limitations are explicitly disclosed without claiming acceptance.
- A real synthetic-preview submission appears in saved history after reload. Desktop and 390px app-width captures show the new form and saved entry.

# Regression constraints

Existing checks, safe evidence display and explicitly synthetic sample view remain functional. Existing Change Event immutability, normalized targets, tenant scoping and dual-provider queries remain intact. No dependency, schema, auth-system or provider integration changes.

# Important edge cases

Missing project domain or key pages; removed/foreign key-page IDs; invalid/future UTC date; blank/overlong description; repeated and conflicting request; long/redacted target; read/save failure; duplicate click; empty history; a history entry whose page was later removed.

# Product / UX requirements

Extend incumbent OpenSEO/DaisyUI. Clear heading and actionable save, native visible labels, inline accessible errors and success, honest immutability and non-causality wording. Saved notes distinguish date changed from date recorded. Form stacks on narrow screens; URLs/notes wrap. Loading/error states include recovery. Retry keeps the submitted facts fixed until the outcome is known or the user explicitly starts another entry; do not silently discard an uncertain submission.

# Specialist review requirements

Bodkin UI independent rendered review against .bodkin-ui/current/shape.md, incumbent Growth/project-context styling, .bodkin-ui/current/screenshots/manifest.json, named desktop/narrow screenshots and passing preflight. No replacement identity, design-document initiative or prototype tournament is authorized.
