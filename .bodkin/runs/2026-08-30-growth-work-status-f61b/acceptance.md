# Required behaviour

- Authorized project members can explicitly change qualifying saved investigation Actions through existing direct transitions. Actor identity comes only from authorization context.
- Missing, foreign or unsupported Actions cannot be read or changed here. Exact-ID scope is independent of list truncation.
- Each successful update preserves immutable metadata and writes the existing versioned event. Stale versions, another actor or changed retry notes cannot silently overwrite history. An exact historical retry returns the current state.
- Recent history is project/action scoped, newest-first and limited to 50, with safe explicit fields and no hashes, keys or raw actor IDs. Ordinary complete graph reads remain unchanged.

# Required checks

Focused tests for scope, legal/illegal transitions, CAS/replay, history order/bound, UI submission and escaped states; executed SQLite and Postgres query coverage; repository `ci:check`, production build and whitespace check. Fresh focused engineering review of the complete slice.

# Regression constraints

No new migrations, dependencies, provider calls or auth system. Preserve the existing approval, source-check navigation, targets, due dates, display URL handling and latest-50 Work bound. No measuring/evaluated transitions through these controls.

# Important edge cases

Rapid duplicate clicks; refresh or reload after uncertain submission; changed notes and different authenticated actors; later states returned by historical retry; deleted/foreign/unsupported sources; more than 50 Actions or events; unavailable reads; terminal states; hostile/long notes and URLs.

# Product / UX requirements

Use existing native disclosure/forms and DaisyUI styling. Visible labels, optional note, explicit save, pending/error/retry feedback and no automatic submission. Show saved current state and distinguish implementation from website execution or evaluated impact. Keep the current layout and narrow-screen wrapping.

# Specialist review requirements

Material EXTEND requires fresh desktop/narrow rendered evidence, bundled UI preflight and fresh Bodkin UI review. Existing browser URL-policy denial blocks these visual gates; static markup and handler tests are supplemental, not a replacement. Do not mark full UI acceptance or reuse old screenshots as evidence for new controls. A code checkpoint may be handed off with the gap explicit.
