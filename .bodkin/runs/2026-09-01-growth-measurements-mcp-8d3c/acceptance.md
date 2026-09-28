# Required behaviour

1. `growth_get_measurements` is registered on the existing OpenSEO MCP server
   and adapted from that same definition into project-bound SAM. SAM removes the
   model-visible project ID and injects its server-bound project.
2. Input is strict `projectId`, optional canonicalized non-empty status subset,
   optional 1-50 limit (default 20), and optional strict `{ createdAt, id }`
   cursor. Equivalent offset cursor timestamps are canonicalized before SQL.
3. Canonical MCP project authorization completes before the read service. Every
   repository query leads with project ID; every Action/Result join includes
   project ID; foreign/missing projects cannot trigger a Measurement read.
4. Root order and keyset semantics are canonical Plan creation time descending
   then SQLite BINARY/PostgreSQL C ID descending. One provider-aware
   chronological SQL expression normalizes SQLite's default timestamp text and
   is used identically in root ordering and every cursor predicate; the raw
   stored value is retained only for output canonicalization. Status filters
   apply before limit. Cap-plus-one yields truthful `hasMore`/`nextCursor`, with
   current-state rather than total/snapshot semantics.
5. Each card exposes only Plan/Action IDs, safe Action title, current Action
   status and `aligned | inconsistent` lifecycle state, Plan status/version,
   canonical anchor/creation/completion timestamps, schedule dates, report
   timezone, comparison mode, due date, exact Metric/primary counts and nullable
   recorded Result summary.
6. Metric rows are selected only after emitted roots in one project-leading,
   per-parent 51-row sentinel query. Every emitted Plan must have 1-50 Metrics
   and at least one primary Metric; violations are rejected before projection.
   Metric IDs/types/entity coordinates and Observation data are not exposed.
7. Results are loaded for emitted roots in one project-leading bulk read.
   Active Plans require no Result/completion; completed Plans require one Result
   whose evaluation time equals Plan completion. Result summary is sanitized
   before its public cap. A recorded outcome is not described as causal proof.
8. Action alignment is true only when active Plan/action versions match a
   measuring Action, or completed Plan/action versions match an evaluated
   Action. Drift returns `inconsistent`; it is not silently called complete or
   rejected as if the current Action were part of the immutable Plan fact.
9. Strict output excludes Plan/Result/Observation hashes, Observation values,
   evidence kinds/refs, Metric entity keys, Change Event/confounder IDs, actors,
   owner IDs, model/prompt fields, provider/account data, secrets and unknown
   fields.
10. Human text calls these saved current Measurement Plans, distinguishes active
    Plans from recorded Results, explains that Results do not establish
    causality, points deeper inspection to `growth_get_action`, and mentions
    continuation only when available.
11. Tool annotations/description state read-only, non-destructive,
    saved-data-only, zero credits, no provider calls, no evidence collection and
    no writes.

# Required checks

- Focused schema, SQLite/D1 repository, live PostgreSQL repository, service,
  MCP handler/protocol and SAM tests pass.
- `pnpm ci:check`, full tests, production build, `git diff --check` and staged
  whitespace checks pass.
- Fresh independent review has no unresolved critical/major finding or material
  verification gap, followed by Director final acceptance.

# Regression constraints

- Existing Measurement start/collect/finalize and Action-detail services remain
  unchanged.
- Existing Growth MCP tools, MCP authorization/transport and SAM project binding
  continue to pass.
- No database/provider/schema/migration/dependency/auth/UI change is introduced.

# Important edge cases

- Equal creation timestamps with IDs whose locale ordering differs from binary
  code-unit ordering.
- Cursor timestamps supplied with non-UTC offsets and SQLite default
  `YYYY-MM-DD HH:mm:ss` creation timestamps; D1 and live PostgreSQL tests prove
  continuation neither repeats nor skips roots.
- Empty/final pages, status-filter-before-limit and cap-plus-one continuation.
- Foreign Action, Metric and Result rows; one Plan with zero, 51 or no primary
  Metrics.
- Active Plan with a Result/completion; completed Plan without a Result or with
  a mismatched evaluation/completion time.
- Action version/status drift for both active and completed Plans.
- Action titles and Result summaries containing secrets, emails or URLs.

# Product / UX requirements

The MCP deep link targets the existing Growth Work surface. No UI change is in
scope.

# Specialist review requirements

Fresh adversarial review must focus on current-state status filtering versus
stable cursor order, provider-equivalent keysets, root-first child bounds,
list-level Plan/Result integrity, Action alignment semantics,
authorization-before-read, privacy projection and absence of any provider,
collection, graph-loop or write path.
