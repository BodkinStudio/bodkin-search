# Required behaviour

- A newly collected valid decline yields one same-run linked Insight and proposed investigation Recommendation before the run completes. Suppressed pages do not yield suggestions. Replaying a check does not recollect or generate again.
- The template preserves the observed facts and snapshot target and states that the cause is unknown. It proposes investigation, not a diagnosed fix or promised uplift.
- Old completed checks are read-only; absence of a saved suggestion is explained without regeneration.
- A project member can review a saved suggestion and explicitly approve it with a valid calendar due date. The server derives project, actor, content, targets and stable action identity.
- Repeated/uncertain approval cannot create duplicate actions for that recommendation. Changed due dates under the same identity conflict. Accepted-without-action retries can finish. Concurrent requests preserve the existing actor and creation event.
- A bounded latest-50 project work list reads saved actions without providers or writes, survives reload and key-page deletion, and opens the action's actual source check.
- Approval does not execute work, record a website change, or enter measurement. No assignment or state-transition controls are exposed.

# Required checks

Focused schema, template, service, auth, query and render tests; real SQLite lifecycle/scope/retry integration; repository CI, production build and whitespace checks. Browser evidence of a real synthetic approval and fresh-document reload, with desktop and 390px app-width states.

# Regression constraints

Preserve saved check observations and terminal lifecycle, existing Change log, safe URL display, normalized relationships, same-project/run graph checks, action event history and both DB query dialects. No migrations/dependencies, paid calls, live project mutations, new auth/MCP or publication.

# Important edge cases

No saved suggestion; missing/foreign/wrong-type signal; running or failed source run; malformed date; absent/currently removed key page; accepted recommendation missing its action; concurrent/duplicate approval; different retry date/actor; long URL/text; read/mutation failure; stale project or run selection; more than 50 actions; partial generation failure.

# Product / UX requirements

Reuse OpenSEO's Growth/DaisyUI patterns. Native labelled date input, linked inline validation, visible pending/error/success and explicit retry. Freeze uncertain due-date submissions; no background or automatic reload retry. Saved work shows due date (UTC), real lifecycle status and source. Clearly separate rule-based suggestions from AI/causal conclusions, approval from implementation, and per-suggestion replay safety from cross-check dedupe. Stack and wrap on narrow screens.

# Specialist review requirements

Fresh Bodkin UI rendered review against .bodkin-ui/current/shape.md, the incumbent approved Growth page, representative desktop/narrow captures and passing preflight. No visual identity or design-document initiative.
