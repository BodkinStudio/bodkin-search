# Required behaviour

- An accepted ADR records that Growth reuses OpenSEO projects, Project Context, competitors, and `project_key_pages`; it defines the project-settings/key-page schema, prototype deployment boundary, and deferred work.
- Every project can read deterministic default Growth settings before a row exists and can persist one project-keyed settings row containing enabled state, report timezone/cadence/day, and explicit scalar measurement-window defaults.
- Growth settings writes pass through a Zod-validated, project-authorized TanStack server function → service → repository boundary.
- Enabling Growth requires the owning project to have a primary domain; absent/archived projects fail without writing.
- Existing key pages expose `commercialWeight` (nullable integer 1–5), `protected`, and `activelyOptimized`; `null`/`false` are neutral defaults for legacy and new rows.
- Existing key-page upserts preserve every omitted stored classification/metadata field, including writes from the app, SAM, and MCP.
- Adding or updating a key page accepts the normalized project hostname and its subdomains, but rejects missing project domains, embedded URL credentials, unrelated/sibling domains, and lookalike suffixes before any batch write.
- Key-page deletion remains possible for a legacy row even if its URL would now fail the add/update policy.
- D1/SQLite and Postgres schemas and generated migrations carry equivalent tables, columns, defaults, constraints, keys, and cascades.

# Required checks

- Focused unit tests cover settings defaults, validation, persistence/service behavior, authorization-facing inputs, and key-page domain/metadata behavior.
- A real in-memory SQLite query test proves omitted metadata survives an upsert and explicit `false`/`null` updates are not mistaken for omission.
- `src/db/schema-parity.test.ts` passes with the new schemas.
- Both migration trees are generated and inspected; no hand-written divergence is left unexplained.
- Full root tests, `ci:check`, and the application build pass.
- Final scope audit proves no dependency manifest/lockfile, auth, scheduling, or later-phase Growth code changed.
- Fresh adversarial review returns pass or all accepted findings are repaired and reverified within the two-round cap.

# Regression constraints

- Current Project Context reads/writes and markdown rendering remain compatible with existing callers.
- Project authorization continues to be enforced by `requireProjectContext`/existing MCP authorization; the new repository never accepts organization or project identity from an unvalidated nested payload.
- Default projects without domains can continue using non-key-page Project Context features.
- Existing rows migrate without requiring backfill data and project deletion cascades to settings.
- No provider calls, credits, schedules, or remote state are introduced.

# Important edge cases

- `www.example.com` and `example.com` normalize to the same owning host.
- `blog.example.com` is allowed for project `example.com`; `example.com.evil.test`, `notexample.com`, and sibling registrable domains are rejected.
- Omitted metadata preserves stored values while explicit `false` overwrites `true` and explicit `null` clears a commercial weight.
- Weekly report days use ISO weekday 1–7; monthly days use 1–28; mismatched values fail validation.
- Timezones must be valid IANA timezone identifiers and measurement day counts must stay within documented bounds.
- A failed operation in a multi-op Project Context batch performs no writes.

# Product / UX requirements

None. UI is explicitly deferred.

# Specialist review requirements

None. Fresh full-scope engineering review is required.
