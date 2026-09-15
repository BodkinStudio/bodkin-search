# Required behaviour

- Done investigation Work can start one Measurement Plan only after the user explicitly selects a manual Change Event already linked to that exact Work item.
- The Plan freezes the selected event ID, canonical `happenedAt`, recorded UTC calendar date, report timezone, current saved windows and canonical metrics. It never uses Done time as a fallback for a new Plan.
- Starting measurement atomically writes the complete Plan/anchor/Metric graph, appends one status event and changes the Action from `implemented` to `measuring`. Invalid or losing writes leave no partial children or transition.
- Exact same-request retries return the winner. A different selected event or proposal conflicts, including events with identical timestamps.
- Cross-project, missing, unlinked, non-manual and future events are rejected. Work without 1–25 URL targets is not eligible for this page-measurement flow.
- Existing legacy Plans retain their fact hashes, remain readable/finalizable and receive no fabricated Change Event relation.
- The Work UI lazily loads measurement state, never preselects or starts automatically, previews the exact saved change and schedule, and renders an existing plan instead of a second start form.
- Pending or uncertain requests lock the exact project/Action/version/event pair. Retry resends it; authoritative refresh must succeed before another selection is allowed.
- Copy describes performance after a recorded change without asserting that the change caused it.

# Required checks

- Strict schema, service, server-boundary, static-render and submission-state tests.
- D1 migration structure/preservation/rollback plus actual SQLite tenancy, atomicity, limit and retry tests.
- Executed disposable PostgreSQL migrations and measurement concurrency/anchor tests.
- D1/Postgres schema parity, formatting, type checking, Knip, type-aware lint, skill-sync cleanliness and whitespace checks.
- One production client/SSR build.
- Fresh full engineering review against this acceptance contract and final DEEP acceptance audit.

# Regression constraints

- Existing Action status/history, Change Log and Work-to-Change linking remain unchanged.
- Action `implementedAt` remains the server-stamped Done milestone and is not backdated or presented as website evidence.
- Existing result-level confounder links and report readers remain valid; the primary anchor cannot also be accepted as its own confounder.
- No provider call, observation, result or causal claim occurs when measurement starts.
- Project and actor identity remain middleware-derived; safe DTOs do not expose actor IDs, hashes, external references or unredacted URLs.

# Important edge cases

- Selected event date precedes or follows Done but is not in the future.
- Western report timezone with a manual midnight-UTC Change date.
- Zero-day cooldown; month, year and leap-day boundaries; null long window.
- Multiple linked events, same timestamps, hidden display URLs, multiple URL targets up to the metric cap.
- Existing active/completed legacy or anchored Plan; measuring Action with a missing Plan; stale Action version; response lost after commit.
- Project, Action or Change deletion obeys the normalized anchor constraints without cross-project leakage.

# Product / UX requirements

- Preserve the incumbent Work card, typography, spacing, DaisyUI controls and native lazy disclosure pattern.
- Summary labels are `Start measurement`, `View measurement` and `View measured result` for Done, Measuring and Evaluated.
- Show loading, read error, ineligible/empty, selected preview, pending, uncertain, saved and read-only states.
- Use native labelled form controls, associated help/error text, disabled fieldsets, status/alert announcements, visible focus and correct heading order.
- Keep the panel single-column and readable on narrow screens; schedule facts may become a two-column grid at `sm`.

# Specialist review requirements

- Bodkin UI preflight and fresh independent rendered review against desktop and narrow screenshots. If the existing browser restriction prevents capture, the run must remain escalated rather than accepted.
