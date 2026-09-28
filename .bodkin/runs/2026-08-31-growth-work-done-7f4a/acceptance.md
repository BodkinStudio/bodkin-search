# Required behaviour

- An authorized user can mark qualifying approved, ready, in-progress or blocked investigation work Done with one explicit save and optional note. No preliminary status saves are required.
- One atomic transition records implemented, its server timestamp, original source status, actor and note at exactly the next version. No synthetic intermediate events or start time are created. Existing recorded starts remain unchanged.
- Exact retries remain actor/note bound and return current state; stale or conflicting updates cannot overwrite history. Foreign, missing and unsupported Actions remain inaccessible.
- Measurement remains a separate lifecycle. An implemented Action with unknown startedAt can proceed through the existing measurement service; implementedAt remains required. Cancelled/evaluated work cannot be reopened.
- Forward migration preserves existing Actions, targets, events, change links, measurement graphs and report links/records with foreign keys enabled. Invalid transitions, tenant keys and milestone combinations remain rejected.

# Required checks

Executed SQLite migration/queries, a populated real local D1 upgrade, migrated disposable Postgres coverage, focused boundary and UI contracts, ci:check, full production bundle, whitespace and independent full engineering review of this feature.

# Regression constraints

No provider calls, dependency additions, auth changes, new state/API abstractions or mutations of historical evidence. No remote/live database migration. Keep source-check navigation, due dates, exact-ID scope, safe bounded history and frozen uncertain submissions.

# Important edge cases

Approved version zero; ready version one; double clicks; failed/uncertain submission; changed note/actor retry; later measuring/evaluated state returned by replay; unknown start time; existing start preserved; populated migration including dependent records; invalid edges and malformed events.

# Product / UX requirements

Preserve the existing Work list/disclosure and native labelled form. Done is the default for eligible work; the visible submit action says Mark done. Choosing another status changes the submit label to Save status. Nothing submits on mount/reload. Copy explains that Done records finished investigation work, not website execution or measured SEO impact. Keep pending/error feedback and optional-note validation.

# Specialist review requirements

Material EXTEND: fresh desktop/narrow captures, bundled preflight and independent Bodkin UI review. Prior URL-policy denial remains binding. A truthful code checkpoint may be delivered with this gap explicit, but no complete UI acceptance or passing visual verdict may be invented.
