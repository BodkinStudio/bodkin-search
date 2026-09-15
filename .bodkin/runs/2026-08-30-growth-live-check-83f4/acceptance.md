# Required behaviour

- Opening Growth reads only project-local setup/history. No Google, DataForSEO or model call occurs on view, refresh, evidence expansion or project switch.
- A user can explicitly run a priority-page check when the project has a Search Console connection and configured key pages. Missing prerequisites explain recovery using existing settings/context navigation.
- Server-created adjacent equal 28-day windows respect the existing three-Pacific-day source lag. The existing bounded adapter and deterministic detector remain authoritative.
- Save real run and signal rows using existing persistence. On reload, history and numeric evidence remain readable. Do not write fixtures from the sample panel into project storage.
- Duplicate/concurrent submissions with the same request key collect at most once. Uncertain retries reuse the key. Failed/interrupted attempts are not silently recollected into the same immutable run; a new explicit attempt uses a new key.
- Scope every read/write to the authorised project; organisation and actor identity cannot be client-overridden. Reject foreign run/signal IDs and unsupported record kinds at the relevant boundary.
- Provider failures become safe persistent failures, not leaked payloads. Incomplete retrieval/data is labelled as incomplete or limited; zero signals are never called proof of healthy pages. Running records carry no false background-completion promise.
- Signal evidence uses the existing packet assembler, retains numeric/provenance facts and clearly states that project context is current rather than frozen. No untrusted HTML rendering or unsafe URL navigation.

# Required checks

- Targeted orchestration/API tests: missing setup, date boundaries, no provider reads on overview/evidence, success and persistence, replay/concurrency, failed/partial runs, project/organisation scoping.
- Existing Growth detector/packet/run regressions and a real SQLite integration path with mocked GSC responses; do not claim a live Google round trip.
- Client rendering/state tests for setup, pending/error, saved-run/history, evidence and explicit sample separation; representative browser desktop/narrow states and keyboard-accessible controls.
- One independent `pnpm ci:check`, one `pnpm build`, `git diff --check`; no dependency or database-schema change.

# Regression constraints

Preserve existing Growth preview behavior and source disclosure, current project authorization, legal run transitions, immutable signal facts, dual-provider query compatibility and unrelated OpenSEO navigation/features.

# Important edge cases

No key pages, no GSC connection, revoked grant, untrusted provider error, capped retrieval, missing observations, no declines, duplicate or timed-out request, stale running history, project switch during request and a foreign signal/run ID. Recent-run reads are bounded.

# Product / UX requirements

Reuse the established Growth/OpenSEO design. Primary job: check priority pages and inspect saved declines. One obvious primary action; loading/error/status text, truthful empty states, visible focus and useful narrow layout. Sample data is secondary and explicitly synthetic. Do not imply recommendations, actions, full-page history or automation exist.

# Specialist review requirements

Fresh Bodkin rendered-UI review of the shape plus desktop/narrow evidence and preflight. A focused engineering review covers orchestration, persistence and trust boundaries. These may be two compact verdicts; no duplicated broad verification or design-documentation project.
